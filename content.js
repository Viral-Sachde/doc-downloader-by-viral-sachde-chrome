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
          

            
          // Return true to indicate we'll send a response asynchronously
          return true;
        }
      });
    }
  
    async extractDocumentLinks(settings, pageUrl) {
      try {
        const links = new Map();
        const { fileExtensions, linkSelectors, innerContent, makeAbsolute } = settings;
  
        // Create regex for file extensions
        const extPattern = new RegExp(`\\.(${fileExtensions.join('|')})(\\?.*)?$`, 'i');
  
        // Process each selector type
        linkSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            
            elements.forEach(element => {
              const href = element.getAttribute('href') || 
                          element.getAttribute('data-href') || 
                          element.getAttribute('data-download');
              
              if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
                return;
              }
  
              let finalUrl = href.trim();
              
              // Make absolute if needed
              if (makeAbsolute) {
                finalUrl = this.makeAbsoluteUrl(finalUrl, pageUrl);
              }
  
              // Check if it matches document extensions
              if (extPattern.test(finalUrl)) {
                let title = '';
                
                if (innerContent) {
                  title = this.extractElementText(element) ||
                         element.getAttribute('title') ||
                         element.getAttribute('aria-label') ||
                         element.getAttribute('data-title') ||
                         '';
                }
  
                // Extract additional metadata
                const metadata = this.extractLinkMetadata(element, finalUrl);
  
                links.set(finalUrl, {
                  url: finalUrl,
                  title: title.trim(),
                  filename: metadata.filename,
                  extension: metadata.extension,
                  estimatedSize: metadata.estimatedSize,
                  tooltip: metadata.tooltip,
                  element: element.outerHTML.substring(0, 200) + '...', // For debugging
                  pageUrl: pageUrl
                });
              }
            });
          } catch (error) {
            console.warn(`Error processing selector "${selector}":`, error);
          }
        });
  
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
  
    extractElementText(element) {
      // Get clean text content, avoiding script/style elements
      const clone = element.cloneNode(true);
      
      // Remove script and style elements
      const unwanted = clone.querySelectorAll('script, style, noscript');
      unwanted.forEach(el => el.remove());
      
      // Get text and clean it
      let text = clone.textContent || clone.innerText || '';
      return text.replace(/\s+/g, ' ').trim();
    }
  
    extractLinkMetadata(element, linkUrl) {
      try {
        const urlObj = new URL(linkUrl, window.location.href);
        const pathname = urlObj.pathname;
        const filename = this.extractFilename(pathname, element);
        const extension = this.extractExtension(filename || pathname);
        
        return {
          filename: this.slugifyFilename(filename),
          extension: extension,
          estimatedSize: this.estimateFileSize(element, extension),
          tooltip: this.buildTooltip(extension, null)
        };
      } catch (error) {
        console.warn('Error extracting metadata for URL:', linkUrl, error);
        
        // Fallback metadata
        const fallbackFilename = `document-${Date.now()}`;
        const extension = this.extractExtension(linkUrl);
        
        return {
          filename: this.slugifyFilename(fallbackFilename + (extension ? '.' + extension : '')),
          extension: extension,
          estimatedSize: this.estimateFileSize(element, extension),
          tooltip: this.buildTooltip(extension, null)
        };
      }
    }
  
    extractFilename(pathname, element) {
      // Try to get filename from various sources
      const contentDisposition = element.getAttribute('data-filename');
      if (contentDisposition) return contentDisposition;
  
      // Extract from pathname
      const pathParts = pathname.split('/');
      const lastPart = pathParts[pathParts.length - 1];
      
      if (lastPart && lastPart.includes('.')) {
        return decodeURIComponent(lastPart.split('?')[0]);
      }
  
      // Generate from element text if available
      const text = this.extractElementText(element);
      if (text && text.length > 0 && text.length < 100) {
        const ext = this.extractExtension(pathname);
        return this.slugifyFilename(`${text}${ext ? '.' + ext : ''}`);
      }
  
      // Fallback
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
      
      // Simple slugify
      const slug = namePart
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      return `${slug}${ext}`;
    }
  
    parsePath(filename) {
      const lastDotIndex = filename.lastIndexOf('.');
      if (lastDotIndex === -1 || lastDotIndex === 0) {
        return { name: filename, ext: '' };
      }
      
      return {
        name: filename.substring(0, lastDotIndex),
        ext: filename.substring(lastDotIndex)
      };
    }
  
    estimateFileSize(element, extension) {
      // Try to get size from data attributes
      const sizeAttr = element.getAttribute('data-size') || 
                      element.getAttribute('data-filesize') ||
                      element.getAttribute('data-bytes');
      
      if (sizeAttr) {
        const size = parseInt(sizeAttr);
        if (!isNaN(size)) return size;
      }
  
      // Look for size information in the element text
      const text = this.extractElementText(element);
      const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|bytes?)/i);
      
      if (sizeMatch) {
        const value = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toUpperCase();
        
        switch (unit) {
          case 'KB': return value * 1024;
          case 'MB': return value * 1024 * 1024;
          case 'GB': return value * 1024 * 1024 * 1024;
          case 'BYTES':
          case 'BYTE': return value;
          default: return value;
        }
      }
  
      // Default estimates based on file type
      const defaultSizes = {
        'pdf': 500 * 1024,      // 500KB
        'doc': 100 * 1024,      // 100KB
        'docx': 150 * 1024,     // 150KB
        'xls': 50 * 1024,       // 50KB
        'xlsx': 75 * 1024,      // 75KB
        'ppt': 1024 * 1024,     // 1MB
        'pptx': 1.5 * 1024 * 1024, // 1.5MB
        'txt': 10 * 1024,       // 10KB
        'csv': 25 * 1024,       // 25KB
        'rtf': 50 * 1024,       // 50KB
        'odt': 100 * 1024       // 100KB
      };
  
      return defaultSizes[extension] || 100 * 1024; // Default 100KB
    }
  
    buildTooltip(extension, sizeBytes) {
      const kind = extension ? extension.toUpperCase() : 'FILE';
      const size = sizeBytes ? this.humanFileSize(sizeBytes) : 'unknown size';
      return `${kind}, ${size}, opens in a new window`;
    }
  
    humanFileSize(bytes) {
      if (!bytes || bytes === 0) return 'Unknown size';
      
      const units = ['B', 'KB', 'MB', 'GB'];
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
  }
  
  // Initialize the content script
  new ContentExtractor();