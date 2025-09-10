// Background service worker for Document Link Extractor
class BackgroundService {
    constructor() {
      this.setupEventListeners();
      this.initializeExtension();
    }
  
    initializeExtension() {
      // Set default settings on install
      chrome.runtime.onInstalled.addListener((details) => {
        if (details.reason === 'install') {
          this.setDefaultSettings();
        }
      });
  
      // Handle extension icon click
      chrome.action.onClicked.addListener((tab) => {
        // This will open the popup - handled automatically by manifest
      });
    }
  
    setupEventListeners() {
      // Handle messages from popup and content scripts
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.action) {
          case 'getBadgeText':
            chrome.action.getBadgeText({ tabId: sender.tab?.id }, (text) => {
              sendResponse({ badgeText: text });
            });
            return true;
  
          case 'setBadgeText':
            this.setBadgeText(request.tabId, request.text, request.color);
            sendResponse({ success: true });
            break;
  
          case 'getTabInfo':
            chrome.tabs.get(request.tabId, (tab) => {
              if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
              } else {
                sendResponse({ tab: tab });
              }
            });
            return true;
  
          default:
            sendResponse({ error: 'Unknown action' });
        }
      });
  
      // Monitor tab updates to clear badge when navigating
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'loading') {
          chrome.action.setBadgeText({ tabId: tabId, text: '' });
        }
      });
  
      // Handle download events
      chrome.downloads.onCreated.addListener((downloadItem) => {
        console.log('Download started:', downloadItem.filename);
      });
  
      chrome.downloads.onChanged.addListener((downloadDelta) => {
        if (downloadDelta.state && downloadDelta.state.current === 'complete') {
          console.log('Download completed:', downloadDelta.id);
          this.notifyDownloadComplete(downloadDelta.id);
        } else if (downloadDelta.error) {
          console.error('Download failed:', downloadDelta.error);
        }
      });

      
      // Example: when tab is updated, set badge for that tab

    }

    
  
    async setDefaultSettings() {
      const defaultSettings = {
        innerContent: true,
        makeAbsolute: true,
ignoreHeaderFooterFiles:true,
        mediaPrefixXlsx: 'media | /Sitecore/media files/Y/SiteName/Universal/investors/result-reports-presentation/example.pdf"',
        mediaPrefixHtml: '/~/media/Files/Y/SiteName/Universal/investors/result-reports-presentation/example.pdf',
        fileExtensions: 'pdf,docx,doc,xlsx,xls,pptx,ppt,txt,csv,rtf,odt',
        linkSelectors: 'a[href],link[href],a[data-href],a[data-download]'
      };
  
      try {
        await chrome.storage.sync.set(defaultSettings);
        console.log('Default settings initialized');
      } catch (error) {
        console.error('Failed to set default settings:', error);
      }
    }
  
 
    setBadgeText(tabId, text = "V", backgroundColor = "#344966") {
    // text must be a string
      chrome.action.setBadgeText({ tabId, text: String(text) });
    
      // color must be in a supported format (CSS color or [R,G,B,A])
      chrome.action.setBadgeBackgroundColor({ tabId, color: backgroundColor });    }
    
  
    async notifyDownloadComplete(downloadId) {
      try {
        const downloadItem = await this.getDownloadItem(downloadId);
        
        if (downloadItem && downloadItem.filename) {
          // Show notification for completed download
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon-48.png',
            title: 'Doc Dowloader By Viral Sachde',
            message: `Downloaded: ${downloadItem.filename}`
          });
        }
      } catch (error) {
        console.error('Error handling download completion:', error);
      }
    }
  
    getDownloadItem(downloadId) {
      return new Promise((resolve, reject) => {
        chrome.downloads.search({ id: downloadId }, (results) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(results[0] || null);
          }
        });
      });
    }
  
    // Utility method to inject content script if not already injected
    async injectContentScript(tabId) {
      try {
        // Try to ping the content script first
        const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return true; // Content script already exists
      } catch (error) {
        // Content script doesn't exist, inject it
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          });
          return true;
        } catch (injectionError) {
          console.error('Failed to inject content script:', injectionError);
          return false;
        }
      }
    }

    
  
    // Handle context menu (if we want to add right-click functionality later)
    setupContextMenu() {
      chrome.contextMenus.create({
        id: 'extract-links',
        title: 'Extract document links',
        contexts: ['page']
      });
  
      chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === 'extract-links') {
          // Open popup or trigger extraction
          chrome.action.openPopup();
        }
      });
    }
  }
  
  // Initialize the background service
  new BackgroundService();