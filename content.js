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

  handleDuplicateFilenames(links) {
    const filenameMap = new Map();
    
    // First pass: count occurrences of each filename
    links.forEach(link => {
      const baseFilename = link.filename;
      if (!filenameMap.has(baseFilename)) {
        filenameMap.set(baseFilename, []);
      }
      filenameMap.get(baseFilename).push(link);
    });
    
    // Second pass: rename duplicates
    filenameMap.forEach((linkGroup, baseFilename) => {
      if (linkGroup.length > 1) {
        linkGroup.forEach((link, index) => {
          if (index === 0) {
            // First occurrence keeps original name
            return;
          } else {
            // Add suffix to duplicates
            link.filename = `${baseFilename}-${index}`;
            link.filenameWithExt = `${baseFilename}-${index}.${link.extension}`;
          }
        });
      }
    });
    
    return links;
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
       // Enhanced bad zone detection
const badZoneSelectors = [
  'header', 'footer', 'nav', 'aside',
  '[role="banner"]', '[role="contentinfo"]', '[role="navigation"]', '[role="complementary"]',
  '.site-header', '.site-footer', '.global-header', '.global-footer',
  '.header', '.footer', '.navigation', '.nav', '.navbar', '.nav-bar',
  '.site-nav', '.main-nav', '.primary-nav', '.secondary-nav',
  '.breadcrumb', '.breadcrumbs', '.page-header', '.page-footer',
  '.top-bar', '.bottom-bar', '.masthead', '.site-info',
  '#header', '#footer', '#navigation', '#nav', '#navbar',
  '#site-header', '#site-footer', '#main-nav', '#primary-nav',  
  // Corporate website specific
  '.footer', '.site-footer', '.page-footer', '.main-footer',
  '.footer-section', '.footer-content', '.footer-wrapper',
  '.footer-links', '.footer-nav', '.footer-menu',
  
  // More specific patterns
  '[class*="footer"]', '[id*="footer"]',
  '.legal-links', '.corporate-links', '.utility-links',
];

const badZones = document.querySelectorAll(badZoneSelectors.join(', '));

const isInBadZone = (element) => {
  // Check if element itself matches bad zone selectors
  for (const selector of badZoneSelectors) {
    try {
      if (element.matches(selector)) return true;
    } catch (e) {}
  }
  
  // Check if ANY ancestor (at any depth) is a bad zone
  let currentElement = element;
  while (currentElement && currentElement !== document.body) {
    // Check against all bad zone elements
    for (const zone of badZones) {
      if (zone === currentElement) {
        return true;
      }
    }
    
    // Also check if current ancestor matches bad zone selectors
    for (const selector of badZoneSelectors) {
      try {
        if (currentElement.matches(selector)) {
          return true;
        }
      } catch (e) {}
    }
    
    currentElement = currentElement.parentElement;
  }
  
  return false;
};
          
const elements = Array.from(document.querySelectorAll(selector))
.filter(element => !isInBadZone(element));
          
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
                title = (element.innerText || '').trim() ||
                        this.extractElementText(element) ||
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
                filenameWithExt: metadata.filenameWithExt,
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
      const deduplicatedLinks = this.handleDuplicateFilenames(linkArray);
      return {
        success: true,
        links: deduplicatedLinks,
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
      
      const slugifiedFilename = this.slugifyFilename(filename);
      // Remove extension from slugified filename to avoid double extensions
      const filenameWithoutExt = slugifiedFilename.replace(/\.[^.]*$/, '');
      return {
        filename: filenameWithoutExt,
        filenameWithExt: filenameWithoutExt + (extension ? '.' + extension : ''),
        extension: extension,
        estimatedSize: this.estimateFileSize(element, extension),
        tooltip: this.buildTooltip(extension, this.estimateFileSize(element, extension))
      };
    } catch (error) {
      console.warn('Error extracting metadata for URL:', linkUrl, error);
      
      // Fallback metadata
      const fallbackFilename = `document-${Date.now()}`;
      const extension = this.extractExtension(linkUrl);
      
      const slugifiedFallback = this.slugifyFilename(fallbackFilename + (extension ? '.' + extension : ''));
      return {
        filename: this.slugifyFilename(fallbackFilename),
        filenameWithExt: slugifiedFallback,
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
    const text = (element.innerText || '').trim();
    if (text) {
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
    // 1. Try data attributes (existing)
    const sizeAttr = element.getAttribute('data-size') || 
                    element.getAttribute('data-filesize') ||
                    element.getAttribute('data-bytes') ||
                    element.getAttribute('data-file-size') ||
                    element.getAttribute('size') ||
                    element.getAttribute('filesize');
    
    if (sizeAttr) {
      const size = parseInt(sizeAttr);
      if (!isNaN(size)) return size;
    }
  
    // 2. Check parent elements for size info
    let parentElement = element.parentElement;
    let depth = 0;
    while (parentElement && depth < 3) {
      const parentText = this.extractElementText(parentElement);
      const parentSizeMatch = parentText.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|bytes?)/i);
      if (parentSizeMatch) {
        const value = parseFloat(parentSizeMatch[1]);
        const unit = parentSizeMatch[2].toUpperCase();
        const bytes = this.convertToBytes(value, unit);
        if (bytes) return bytes;
      }
      parentElement = parentElement.parentElement;
      depth++;
    }
  
    // 3. Check sibling elements
    const siblings = element.parentElement ? Array.from(element.parentElement.children) : [];
    for (const sibling of siblings) {
      if (sibling !== element) {
        const siblingText = this.extractElementText(sibling);
        const siblingMatch = siblingText.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|bytes?)/i);
        if (siblingMatch) {
          const value = parseFloat(siblingMatch[1]);
          const unit = siblingMatch[2].toUpperCase();
          const bytes = this.convertToBytes(value, unit);
          if (bytes) return bytes;
        }
      }
    }
  
    // 4. Enhanced element text search (existing but improved)
    const text = this.extractElementText(element);
    const patterns = [
      /(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|bytes?)/i,
      /(\d+(?:,\d{3})*)\s*bytes?/i,
      /size[:\s]*(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|B)/i,
      /(\d+(?:\.\d+)?)\s*([KMGT]?B)\b/i
    ];
  
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        const unit = match[2] ? match[2].toUpperCase() : 'B';
        const bytes = this.convertToBytes(value, unit);
        if (bytes) return bytes;
      }
    }
  
    // 5. Check aria-label and title attributes
    const ariaLabel = element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';
    const combinedAttrs = ariaLabel + ' ' + title;
    
    const attrMatch = combinedAttrs.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|bytes?)/i);
    if (attrMatch) {
      const value = parseFloat(attrMatch[1]);
      const unit = attrMatch[2].toUpperCase();
      const bytes = this.convertToBytes(value, unit);
      if (bytes) return bytes;
    }
  
    // 6. Check for hidden elements with size info
    const hiddenSizeElement = element.querySelector('[data-size], [data-filesize], .file-size, .size');
    if (hiddenSizeElement) {
      const hiddenText = this.extractElementText(hiddenSizeElement);
      const hiddenMatch = hiddenText.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|bytes?)/i);
      if (hiddenMatch) {
        const value = parseFloat(hiddenMatch[1]);
        const unit = hiddenMatch[2].toUpperCase();
        const bytes = this.convertToBytes(value, unit);
        if (bytes) return bytes;
      }
    }
  
    // Return null if no exact size found
    return null;
  }
  
  convertToBytes(value, unit) {
    if (!value || isNaN(value)) return null;
    
    switch (unit) {
      case 'TB': return Math.round(value * 1024 * 1024 * 1024 * 1024);
      case 'GB': return Math.round(value * 1024 * 1024 * 1024);
      case 'MB': return Math.round(value * 1024 * 1024);
      case 'KB': return Math.round(value * 1024);
      case 'BYTES':
      case 'BYTE':
      case 'B': return Math.round(value);
      default: return Math.round(value); // Assume bytes if no unit
    }
  }

  
  buildTooltip(extension, sizeBytes) {
    const kind = extension ? extension.toUpperCase() : 'FILE';
    const size = sizeBytes ? this.humanFileSize(sizeBytes) : 'size not available';
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