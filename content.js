// Content script for Document Link Extractor
class ContentExtractor {
  constructor() {
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extractLinks') {
        this.extractDocumentLinks(request.settings, request.pageUrl)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // async response
      }
    });
  }

  async extractDocumentLinks(settings, pageUrl) {
    try {
      const links = new Map();
      const { fileExtensions, linkSelectors, innerContent, makeAbsolute, ignoreHeaderFooterFiles } = settings;

      const extPattern = new RegExp(`\\.(${fileExtensions.join('|')})(\\?.*)?$`, 'i');

      // collect all header/footer nodes once for proper filtering
      const headerFooterNodes = ignoreHeaderFooterFiles
        ? Array.from(document.querySelectorAll("header, footer"))
        : [];

      for (const selector of linkSelectors) {
        try {
          const elements = document.querySelectorAll(selector);

          for (const element of elements) {
            if (ignoreHeaderFooterFiles && headerFooterNodes.length > 0) {
              const insideHeaderFooter = headerFooterNodes.some(node => node.contains(element));
              if (insideHeaderFooter) continue;
            }
          
            const href = element.getAttribute('href') ||
                         element.getAttribute('data-href') ||
                         element.getAttribute('data-download');
          
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
          
            let finalUrl = href.trim();
          
            if (makeAbsolute) {
              finalUrl = this.makeAbsoluteUrl(finalUrl, pageUrl);
            }
          
            // normalize to avoid duplicate counting
            finalUrl = this.normalizeUrl(finalUrl);
          
            if (extPattern.test(finalUrl)) {
              let title = '';
              if (innerContent) {
                title = this.extractElementText(element) ||
                        element.getAttribute('title') ||
                        element.getAttribute('aria-label') ||
                        element.getAttribute('data-title') ||
                        '';
              }
          
              // Extract metadata with proper file size fetching
              const metadata = await this.extractLinkMetadata(element, finalUrl);
          
              links.set(finalUrl, {
                url: finalUrl,
                title: title.trim(),
                filenameWithExt: metadata.filenameWithExt,
                filenameWithoutExt: metadata.filenameWithoutExt,
                extension: metadata.extension,
                estimatedSize: metadata.estimatedSize,
                tooltip: metadata.tooltip,
                element: element.outerHTML.substring(0, 200) + '...',
                pageUrl: pageUrl
              });
            }
          }
          
        } catch (error) {
          console.warn(`Error processing selector "${selector}":`, error);
        }
      }

      const linkArray = Array.from(links.values());

      return {
        success: true,
        links: linkArray,
        pageUrl: pageUrl,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Content extraction error:', error);
      throw error;
    }
  }

  normalizeUrl(url) {
    try {
      const u = new URL(url, window.location.href);
      u.hash = '';
      u.search = '';
      return u.toString();
    } catch {
      return url;
    }
  }

  extractElementText(element) {
    const clone = element.cloneNode(true);
    const unwanted = clone.querySelectorAll('script, style, noscript');
    unwanted.forEach(el => el.remove());
    let text = clone.textContent || clone.innerText || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  async fetchFileSize(url) {
    try {
      // Try HEAD request first (most efficient)
      const response = await fetch(url, { 
        method: "HEAD",
        mode: 'cors',
        cache: 'no-cache'
      });
      
      if (response.ok) {
        const size = response.headers.get("content-length");
        if (size) {
          return parseInt(size, 10);
        }
      }
      
      // If HEAD fails, try GET with range request for first byte
      const rangeResponse = await fetch(url, {
        headers: { 'Range': 'bytes=0-0' },
        mode: 'cors',
        cache: 'no-cache'
      });
      
      if (rangeResponse.status === 206) {
        const contentRange = rangeResponse.headers.get("content-range");
        if (contentRange) {
          const match = contentRange.match(/bytes 0-0\/(\d+)/);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn("Failed to fetch file size for:", url, error.message);
      return null;
    }
  }

  async extractLinkMetadata(element, linkUrl) {
    try {
      const urlObj = new URL(linkUrl, window.location.href);
      const pathname = urlObj.pathname;
      const filename = this.extractFilename(pathname, element);
      const extension = this.extractExtension(filename || pathname);

      const parsed = this.parsePath(filename);

      // Fetch actual file size
      const fileSize = await this.fetchFileSize(linkUrl);
      const estimatedSize = fileSize || this.getDefaultSizeByExtension(extension);

      return {
        filenameWithExt: this.slugifyFilename(filename),
        filenameWithoutExt: this.slugifyNameOnly(parsed.name),
        extension: extension,
        estimatedSize: estimatedSize,
        tooltip: this.buildTooltip(extension, estimatedSize)
      };
    } catch (error) {
      console.warn('Error extracting metadata for URL:', linkUrl, error);

      const fallbackFilename = `document-${Date.now()}`;
      const extension = this.extractExtension(linkUrl);

      return {
        filenameWithExt: this.slugifyFilename(fallbackFilename + (extension ? '.' + extension : '')),
        filenameWithoutExt: this.slugifyNameOnly(fallbackFilename),
        extension: extension,
        estimatedSize: this.getDefaultSizeByExtension(extension),
        tooltip: this.buildTooltip(extension, null)
      };
    }
  }

  getDefaultSizeByExtension(extension) {
    // Default estimated sizes in bytes for common file types
    const defaultSizes = {
      'pdf': 500000,    // 500KB
      'doc': 100000,    // 100KB
      'docx': 50000,    // 50KB
      'xls': 150000,    // 150KB
      'xlsx': 75000,    // 75KB
      'ppt': 500000,    // 500KB
      'pptx': 250000,   // 250KB
      'txt': 5000,      // 5KB
      'rtf': 25000,     // 25KB
      'csv': 20000,     // 20KB
      'zip': 1000000,   // 1MB
      'rar': 1000000,   // 1MB
      '7z': 800000,     // 800KB
      'jpg': 100000,    // 100KB
      'jpeg': 100000,   // 100KB
      'png': 200000,    // 200KB
      'gif': 50000,     // 50KB
      'svg': 15000,     // 15KB
      'mp3': 3000000,   // 3MB
      'wav': 10000000,  // 10MB
      'mp4': 50000000,  // 50MB
      'avi': 100000000, // 100MB
      'mov': 75000000   // 75MB
    };
    
    return defaultSizes[extension?.toLowerCase()] || 50000; // Default 50KB
  }

  extractFilename(pathname, element) {
    const contentDisposition = element.getAttribute('data-filename');
    if (contentDisposition) return contentDisposition;

    const pathParts = pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];

    if (lastPart && lastPart.includes('.')) {
      return decodeURIComponent(lastPart.split('?')[0]);
    }

    const text = this.extractElementText(element);
    if (text && text.length > 0 && text.length < 100) {
      const ext = this.extractExtension(pathname);
      return this.slugifyFilename(`${text}${ext ? '.' + ext : ''}`);
    }

    return `document-${Date.now()}${this.extractExtension(pathname) ? '.' + this.extractExtension(pathname) : ''}`;
  }

  extractExtension(path) {
    const match = path.match(/\.([a-zA-Z0-9]+)(\?.*)?$/);
    return match ? match[1].toLowerCase() : '';
  }

  slugifyFilename(filename) {
    if (!filename) return '';
    const parsed = this.parsePath(filename);
    const namePart = parsed.name || `file-${Date.now()}`;
    const ext = parsed.ext || '';
    const slug = namePart
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `${slug}${ext}`;
  }

  slugifyNameOnly(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  parsePath(filename) {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return { name: filename, ext: '' };
    }
    return { name: filename.substring(0, lastDotIndex), ext: filename.substring(lastDotIndex) };
  }

  buildTooltip(extension, sizeBytes) {
    const kind = extension ? extension.toUpperCase() : 'FILE';
    const size = sizeBytes ? this.humanFileSize(sizeBytes) : 'Unknown size';
    return `${kind}, ${size}, opens in a new window`;
  }

  humanFileSize(bytes) {
    if (!bytes || bytes === 0) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = Math.abs(bytes);
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  makeAbsoluteUrl(link, baseUrl) {
    try {
      return new URL(link, baseUrl).toString();
    } catch (error) {
      console.warn('Failed to make absolute URL:', link, error);
      return link;
    }
  }

  // Extract Sitecore media path for CSV export
  extractSitecoreMediaPath(url) {
    try {
      const urlObj = new URL(url, window.location.href);
      const pathname = urlObj.pathname;
      
      // Check if it's a Sitecore media URL
      if (pathname.includes('/sitecore/media') || pathname.includes('/Sitecore/media')) {
        return pathname;
      }
      
      return '';
    } catch (error) {
      console.warn('Error extracting Sitecore media path:', error);
      return '';
    }
  }

  // Generate CSV data for export
  generateCSVData(links) {
    const headers = [
      'URL',
      'Title',
      'Slugified Filename',
      'Slugified Filename with Extension',
      'Media Path',
      'Extension',
      'File Size (Bytes)',
      'File Size (Human)',
      'Page URL'
    ];

    const csvRows = [headers.join(',')];

    links.forEach(link => {
      const row = [
        `"${this.escapeCsvValue(link.url)}"`,
        `"${this.escapeCsvValue(link.title)}"`,
        `"${this.escapeCsvValue(link.slugifiedFilename)}"`,
        `"${this.escapeCsvValue(link.slugifiedFilenameWithExtension)}"`,
        `"${this.escapeCsvValue(link.mediaPath)}"`,
        `"${this.escapeCsvValue(link.extension)}"`,
        link.estimatedSize || 0,
        `"${this.humanFileSize(link.estimatedSize)}"`,
        `"${this.escapeCsvValue(link.pageUrl)}"`
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // Escape CSV values to handle commas, quotes, and newlines
  escapeCsvValue(value) {
    if (!value) return '';
    const stringValue = String(value);
    // Escape quotes by doubling them and wrap in quotes if needed
    return stringValue.replace(/"/g, '""');
  }

  // Export CSV functionality that can be called from popup
  exportToCSV(links, filename = 'document-links') {
    const csvData = this.generateCSVData(links);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    
    // Create download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Initialize the content script
new ContentExtractor();