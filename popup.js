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
  
        if (response && response.success) {
          this.extractedLinks = response.links;
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
  
      if (this.extractedLinks.length === 0) {
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
  
    async downloadFiles() {
      if (this.extractedLinks.length === 0) return;
  
      try {
        this.showStatus('Starting downloads...');
  
        let downloaded = 0;
        const total = this.extractedLinks.length;
  
        for (const link of this.extractedLinks) {
          try {
            this.showStatus(`Downloading ${downloaded + 1}/${total}: ${link.filename}`);
  
            await chrome.downloads.download({
              url: link.url,
              filename: link.filename || undefined,
              saveAs: false
            });
  
            downloaded++;
          } catch (error) {
            console.error(`Failed to download ${link.url}:`, error);
          }
        }
  
        this.showStatus(`Download complete! ${downloaded}/${total} files downloaded.`);
        setTimeout(() => this.hideStatus(), 3000);
  
      } catch (error) {
        console.error('Error downloading files:', error);
        this.showStatus(`Download error: ${error.message}`);
        setTimeout(() => this.hideStatus(), 3000);
      }
    }
  
    async exportData() {
      if (this.extractedLinks.length === 0) return;
  
      try {
        const settings = this.getSettings();
        
        // Create Excel data
        const excelData = this.createExcelData(settings);
        
        // Create HTML snippet
        const htmlSnippet = this.createHtmlSnippet(settings);
  
        // Download Excel file (as CSV for simplicity)
        this.downloadDataFile(excelData, 'document-links-export.csv', 'text/csv');
  
        // Download HTML snippet
        this.downloadDataFile(htmlSnippet, 'document-links.html', 'text/html');
  
      } catch (error) {
        console.error('Error exporting data:', error);
        alert(`Export error: ${error.message}`);
      }
    }
  
    createExcelData(settings) {
      const headers = [
        'original_url', 'title', 'slugified_filename', 'media_constant',
        'file_size_human', 'tooltip', 'extension', 'status'
      ];
  
      const rows = this.extractedLinks.map(link => [
        link.url,
        link.title || '',
        link.filename || '',
        `${settings.mediaPrefixXlsx}${link.filename || ''}`,
        this.humanFileSize(link.estimatedSize),
        link.tooltip || '',
        link.extension || '',
        'extracted'
      ]);
  
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
  
    createHtmlSnippet(settings) {
      const links = this.extractedLinks
        .map(link => {
          const ext = (link.extension || '').toUpperCase();
          const size = this.humanFileSize(link.estimatedSize);
          const href = `${settings.mediaPrefixHtml}/${link.filename || ''}`;
          
          const innerContent = settings.innerContent && link.title
            ? `<span class="icon icon-arrow-in-down"></span> ${link.title}`
            : '<span class="icon icon-arrow-in-down"></span>';
  
          return `<a href="${href}"
     title="${ext}, ${size} opens in a new window"
     target="_blank"
     class="button-label align-items-center d-inline-flex text-decoration-none text-primary-1 pt-sm-2 pb-sm-2 ps-sm-3 pe-sm-3">
     ${innerContent}
  </a>`;
        }).join('\n\n');
  
      return `<!-- Generated by Document Link Extractor Chrome Extension -->\n<!-- Total: ${this.extractedLinks.length} links -->\n\n${links}`;
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