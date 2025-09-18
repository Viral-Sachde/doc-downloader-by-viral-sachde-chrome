class DocumentExtractor {
  constructor() {
    this.extractedLinks = [];
    this.currentTabId = null;
    this.initializeElements();
    this.loadSettings();
    this.attachEventListeners();
  }

  initializeElements() {
    // Form elements
    this.innerContentInput = document.getElementById('innerContent');
    this.makeAbsoluteInput = document.getElementById('makeAbsolute');
    this.mediaPrefixXlsxInput = document.getElementById('mediaPrefixXlsx');
    this.mediaPrefixHtmlInput = document.getElementById('mediaPrefixHtml');
    this.fileExtensionsInput = document.getElementById('fileExtensions');
    this.linkSelectorsInput = document.getElementById('linkSelectors');

    // Buttons
    this.extractBtn = document.getElementById('extractBtn');
    this.downloadBtn = document.getElementById('downloadBtn');
    this.exportBtn = document.getElementById('exportBtn');

    // Results
    this.resultsDiv = document.getElementById('results');
    this.summaryDiv = document.getElementById('summary');
    this.linksListDiv = document.getElementById('linksList');
    this.statusDiv = document.getElementById('status');
    this.statusText = document.getElementById('statusText');
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.sync.get([
        'innerContent', 'makeAbsolute', 'mediaPrefixXlsx', 
        'mediaPrefixHtml', 'fileExtensions', 'linkSelectors'
      ]);

      // Apply saved settings or defaults
      this.innerContentInput.checked = settings.innerContent !== false;
      this.makeAbsoluteInput.checked = settings.makeAbsolute !== false;
      
      if (settings.mediaPrefixXlsx) this.mediaPrefixXlsxInput.value = settings.mediaPrefixXlsx;
      if (settings.mediaPrefixHtml) this.mediaPrefixHtmlInput.value = settings.mediaPrefixHtml;
      if (settings.fileExtensions) this.fileExtensionsInput.value = settings.fileExtensions;
      if (settings.linkSelectors) this.linkSelectorsInput.value = settings.linkSelectors;
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set({
        innerContent: this.innerContentInput.checked,
        makeAbsolute: this.makeAbsoluteInput.checked,
        mediaPrefixXlsx: this.mediaPrefixXlsxInput.value,
        mediaPrefixHtml: this.mediaPrefixHtmlInput.value,
        fileExtensions: this.fileExtensionsInput.value,
        linkSelectors: this.linkSelectorsInput.value
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  attachEventListeners() {
    this.extractBtn.addEventListener('click', () => this.extractLinks());
    this.downloadBtn.addEventListener('click', () => this.downloadFiles());
    this.exportBtn.addEventListener('click', () => this.exportData());

    // Save settings on change
    [this.innerContentInput, this.makeAbsoluteInput, this.mediaPrefixXlsxInput,
     this.mediaPrefixHtmlInput, this.fileExtensionsInput, this.linkSelectorsInput]
      .forEach(input => {
        input.addEventListener('change', () => this.saveSettings());
        input.addEventListener('input', () => this.saveSettings());
      });
  }

  showStatus(message) {
    this.statusText.textContent = message;
    this.statusDiv.classList.remove('hidden');
    this.resultsDiv.classList.add('hidden');
  }

  hideStatus() {
    this.statusDiv.classList.add('hidden');
  }

  getSettings() {
    const extensions = this.fileExtensionsInput.value
      .split(',')
      .map(ext => ext.trim().toLowerCase())
      .filter(ext => ext);

    const selectors = this.linkSelectorsInput.value
      .split(',')
      .map(sel => sel.trim())
      .filter(sel => sel);

    return {
      innerContent: this.innerContentInput.checked,
      makeAbsolute: this.makeAbsoluteInput.checked,
      mediaPrefixXlsx: this.mediaPrefixXlsxInput.value,
      mediaPrefixHtml: this.mediaPrefixHtmlInput.value,
      fileExtensions: extensions,
      linkSelectors: selectors
    };
  }

  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTabId = tab.id;
    return tab;
  }

  /* ----------------------------
     URL normalization + slugify helpers
     ---------------------------- */

  // Create a canonical URL string used for comparisons (removes hash, normalizes host case, strips default ports)
  normalizeUrlForComparison(rawUrl, pageUrl = '') {
    try {
      if (!rawUrl) return '';
      const u = new URL(rawUrl, pageUrl || undefined);
      const protocol = u.protocol.toLowerCase();
      const hostname = u.hostname.toLowerCase();
      // remove default ports
      let port = u.port ? `:${u.port}` : '';
      if ((protocol === 'http:' && u.port === '80') || (protocol === 'https:' && u.port === '443')) port = '';
      // normalize pathname: collapse multiple slashes, strip trailing slash (but keep root '/')
      let pathname = (u.pathname || '/').replace(/\/{2,}/g, '/');
      if (pathname !== '/' ) pathname = pathname.replace(/\/$/, '');
      // keep search (query) as-is — it differentiates resources
      const search = u.search || '';
      return `${protocol}//${hostname}${port}${pathname}${search}`;
    } catch (e) {
      // fallback: return raw string trimmed
      return String(rawUrl || '').trim();
    }
  }

  // extract base name and ext from url path (slugifies basename)
  getBasenameAndExtFromUrl(rawUrl) {
    try {
      const u = new URL(rawUrl);
      let last = u.pathname.split('/').filter(Boolean).pop() || '';
      last = decodeURIComponent(last || '').split('?')[0].split('#')[0].trim();

      const extMatch = last.match(/\.([0-9a-zA-Z]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : '';
      const baseRaw = ext ? last.replace(new RegExp(`\\.${ext}$`), '') : last;

      let base = baseRaw
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .toLowerCase();

      if (!base) base = 'file';
      return { baseName: base, extension: ext };
    } catch (e) {
      // fallback: slugify rawUrl
      const safe = String(rawUrl || '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'file';
      return { baseName: safe, extension: '' };
    }
  }

  // Ensure each raw link has url, title, filename, extension, urlNormalized, estimatedSize
  normalizeLinks(rawLinks = [], pageUrl = '') {
    return rawLinks.map((raw, idx) => {
      const url = raw.url || raw.href || raw.link || '';
      const title = raw.title || raw.text || '';
      const estimatedSize = Number(raw.estimatedSize || raw.size || 0) || 0;
      const urlNormalized = this.normalizeUrlForComparison(url, pageUrl);

      const { baseName, extension } = url ? this.getBasenameAndExtFromUrl(url) : { baseName: `file-${idx}`, extension: '' };
      const filename = baseName;
      const filenameWithExt = extension ? `${filename}.${extension}` : filename;

      return {
        ...raw,
        url,
        urlNormalized,
        title,
        estimatedSize,
        extension,
        filename,
        filenameWithExt,
        pageUrl
      };
    });
  }

  /* ----------------------------
     main extraction
     ---------------------------- */
     async extractLinks() {
      try {
        this.showStatus('Extracting document links from page...');
    
        const tab = await this.getCurrentTab();
        const settings = this.getSettings();
    
        // Send message to content script to extract links
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'extractLinks',
          settings: settings,
          pageUrl: tab.url
        });
    
        if (response && response.success && Array.isArray(response.links)) {
          // --- Log raw links as-is (duplicates included) ---
          console.log("Extracted raw links count:", response.links.length);
          console.table(response.links.map((l, i) => ({ i, url: l.url || l.href })));
          // ----------------------------------------------
    
          // Normalize links (duplicates preserved)
          this.extractedLinks = this.normalizeLinks(response.links, tab.url);
          this.displayResults();
        } else {
          throw new Error(response?.error || 'Failed to extract links');
        }
    
      } catch (error) {
        console.error('Error extracting links:', error);
        this.showStatus(`Error: ${error.message}`);
        setTimeout(() => this.hideStatus(), 3000);
      }
    }
    
  displayResults() {
    this.hideStatus();

    if (!this.extractedLinks || this.extractedLinks.length === 0) {
      this.summaryDiv.innerHTML = '<p>No document links found on this page.</p>';
      this.linksListDiv.innerHTML = '';
      this.resultsDiv.classList.remove('hidden');
      return;
    }

    // Create summary
    const totalSize = this.extractedLinks.reduce((sum, link) => sum + (link.estimatedSize || 0), 0);
    const sizeText = totalSize > 0 ? this.humanFileSize(totalSize) : 'Unknown';
    
    this.summaryDiv.innerHTML = `
      <div><strong>${this.extractedLinks.length}</strong> document links found</div>
      <div>Estimated total size: <strong>${sizeText}</strong></div>
      <div>Page: <em>${this.extractedLinks[0]?.pageUrl || 'Unknown'}</em></div>
    `;

    // Create links list
    this.linksListDiv.innerHTML = this.extractedLinks
      .map(link => `
        <div class="link-item">
          <div class="link-url">${link.url}</div>
          ${link.title ? `<div class="link-title">"${link.title}"</div>` : ''}
          <div style="font-size: 10px; color: #718096; margin-top: 4px;">
            ${link.extension?.toUpperCase() || 'FILE'} • ${this.humanFileSize(link.estimatedSize)}
          </div>
        </div>
      `).join('');

    this.resultsDiv.classList.remove('hidden');
    this.downloadBtn.disabled = false;
    this.exportBtn.disabled = false;
  }

  /* ----------------------------
     duplicate resolution (core)
     - uses urlNormalized as primary key for exact-URL duplicates
     - always pushes every row (sheet preserves duplicates)
     - suffixes base filename when different URLs share same basename
     ---------------------------- */
 handleDuplicateFilenames(links) {
    const urlMap = new Map();     // urlNormalized -> first link seen for that URL
    const filenameMap = new Map(); // baseFilename -> array of links (for suffixing)
    const processed = [];

    links.forEach(link => {
      const urlKey = link.urlNormalized || this.normalizeUrlForComparison(link.url || '');
      const baseFilename = link.filename || (this.getBasenameAndExtFromUrl(link.url || '').baseName);
      const ext = link.extension || (this.getBasenameAndExtFromUrl(link.url || '').extension || '');

      // If same exact (normalized) URL seen before -> mark duplicate
      if (urlMap.has(urlKey)) {
        const first = urlMap.get(urlKey);
        link.filename = first.filename;
        link.filenameWithExt = first.filenameWithExt;
        link.isDuplicate = 'yes';
        processed.push(link);
        return; // do NOT skip pushing: we must keep every DOM row
      }

      // Unique URL -> check filename collisions across different URLs
      if (!filenameMap.has(baseFilename)) filenameMap.set(baseFilename, []);
      const siblings = filenameMap.get(baseFilename);

      let finalFilename = baseFilename;
      if (siblings.length > 0) {
        finalFilename = `${baseFilename}-${siblings.length}`;
      }

      link.filename = finalFilename;
      link.filenameWithExt = ext ? `${finalFilename}.${ext}` : finalFilename;
      link.isDuplicate = 'no';

      // store
      urlMap.set(urlKey, link);
      siblings.push(link);
      processed.push(link);
    });

    // debug: show summary in console (remove if noisy)
    try {
      console.groupCollapsed('handleDuplicateFilenames summary');
      console.log('total input rows:', links.length);
      console.log('total processed rows:', processed.length);
      console.log('urlMap size (unique URLs):', urlMap.size);
      console.table(processed.map(l => ({ url: l.url, urlKey: l.urlNormalized, filename: l.filenameWithExt, isDuplicate: l.isDuplicate })));
      console.groupEnd();
    } catch (e) {}

    return processed;
  }
 
  /* ----------------------------
     downloads: only unique normalized URLs
     ---------------------------- */
  async downloadFiles() {
    if (!this.extractedLinks || this.extractedLinks.length === 0) return;
  
    try {
      this.showStatus('Starting downloads...');

      // Resolve filenames & duplicates (keeps every row but returns processed array)
      const processedLinks = this.handleDuplicateFilenames([...this.extractedLinks]);

      // Unique normalized URLs only (download once per normalized URL)
      const seen = new Set();
      const toDownload = [];
      processedLinks.forEach(lk => {
        const key = lk.urlNormalized || this.normalizeUrlForComparison(lk.url || '');
        if (!seen.has(key)) {
          seen.add(key);
          toDownload.push(lk);
        }
      });

      const duplicateCount = processedLinks.length - toDownload.length;
      let downloaded = 0;
      const total = toDownload.length;

      if (duplicateCount > 0) {
        console.log(`Skipping ${duplicateCount} duplicate occurrences (same normalized URL) from downloads`);
      }

      for (const link of toDownload) {
        try {
          this.showStatus(`Downloading ${downloaded + 1}/${total}: ${link.filenameWithExt}`);
          await chrome.downloads.download({
            url: link.url,
            filename: link.filenameWithExt,
            conflictAction: 'uniquify',
            saveAs: false
          });
          downloaded++;
        } catch (error) {
          console.error(`Failed to download ${link.url}:`, error);
        }
      }

      const statusMessage = duplicateCount > 0 
        ? `Download complete! ${downloaded}/${total} files downloaded. ${duplicateCount} duplicates skipped.`
        : `Download complete! ${downloaded}/${total} files downloaded.`;

      this.showStatus(statusMessage);
      setTimeout(() => this.hideStatus(), 5000);

    } catch (error) {
      console.error('Error downloading files:', error);
      this.showStatus(`Download error: ${error.message}`);
      setTimeout(() => this.hideStatus(), 3000);
    }
  }

  /* ----------------------------
     CSV & HTML creators (use processed links)
     ---------------------------- */
  escapeCsvCell(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  createExcelDataFromLinks(links, settings) {
    const headers = [
      'original_url', 'title', 'slugified_filename_with_ext', 'slugified_filename_no_ext', 'media_constant',
      'media_constant_no_ext', 'link_text', 'file_size_human', 'tooltip', 'extension', 'status', 'is_duplicate'
    ];

    const rows = links.map(link => [
      this.escapeCsvCell(link.url),
      this.escapeCsvCell(link.title || ''),
      this.escapeCsvCell(link.filenameWithExt || ''),
      this.escapeCsvCell(link.filename || ''),
      this.escapeCsvCell(`${settings.mediaPrefixXlsx}/${link.filenameWithExt || ''}`),
      this.escapeCsvCell(`${settings.mediaPrefixXlsx}/${link.filename || ''}`),
      this.escapeCsvCell(link.title || ''),
      this.escapeCsvCell(this.humanFileSize(link.estimatedSize)),
      this.escapeCsvCell(link.tooltip || ''),
      this.escapeCsvCell(link.extension || ''),
      this.escapeCsvCell('extracted'),
      this.escapeCsvCell(link.isDuplicate || 'no')
    ]);

    return [headers.map(h => this.escapeCsvCell(h)).join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  createHtmlSnippetFromLinks(links, settings) {
    const linksHtml = links
      .map(link => {
        const ext = (link.extension || '').toUpperCase();
        const size = this.humanFileSize(link.estimatedSize);
        const href = `${settings.mediaPrefixHtml}/${link.filenameWithExt || ''}`;        
        const innerContent = settings.innerContent && link.title
          ? `<span class="icon icon-arrow-in-down"></span> ${this.escapeHtml(link.title)}`
          : '<span class="icon icon-arrow-in-down"></span>';

        return `<a href="${href}"
   title="${ext}, ${size} opens in a new window"
   target="_blank"
   class="button-label align-items-center d-inline-flex text-decoration-none text-primary-1 pt-sm-2 pb-sm-2 ps-sm-3 pe-sm-3">
   ${innerContent}
</a>`;
      }).join('\n\n');

    return `<!-- Generated by Document Link Extractor Chrome Extension -->\n<!-- Total: ${links.length} links -->\n\n${linksHtml}`;
  }

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // exportData uses processedLinks (keeps every row)
  async exportData() {
    if (!this.extractedLinks || this.extractedLinks.length === 0) return;

    try {
      const settings = this.getSettings();

      // process (resolve filenames + isDuplicate flags) but DO NOT drop duplicate rows
      const processedLinks = this.handleDuplicateFilenames([...this.extractedLinks]);

      const excelData = this.createExcelDataFromLinks(processedLinks, settings);
      const htmlSnippet = this.createHtmlSnippetFromLinks(processedLinks, settings);

      this.downloadDataFile(excelData, 'document-links-export.csv', 'text/csv');
      this.downloadDataFile(htmlSnippet, 'document-links.html', 'text/html');

    } catch (error) {
      console.error('Error exporting data:', error);
      alert(`Export error: ${error.message}`);
    }
  }

  downloadDataFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
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
}

// Initialize the extension when popup loads
document.addEventListener('DOMContentLoaded', () => {
  new DocumentExtractor();
});
