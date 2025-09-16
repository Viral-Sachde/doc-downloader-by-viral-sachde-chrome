# Document Link Extractor Chrome Extension

> **⚠️ Early Stage Development** - This extension is currently in early development. Features may change and bugs are expected.

A powerful Chrome extension that automatically discovers, extracts, and manages document links from web pages. Perfect for researchers, content managers, and anyone who needs to quickly gather downloadable documents from websites.

## 🚀 Features

### Core Functionality

- **🔍 Smart Link Detection**: Automatically finds and extracts document links from any web page
- **📄 Multi-Format Support**: Supports PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, RTF, ODT and more
- **🎯 Customizable Selectors**: Define custom CSS selectors to target specific link types
- **📏 Accurate File Sizing**: Fetches exact file sizes when available (no estimates!)
- **🔗 URL Processing**: Converts relative URLs to absolute URLs automatically

### Data Extraction

- **📝 Title Extraction**: Captures link text, titles, and aria-labels for better context
- **🏷️ Smart Filename Generation**: Creates clean, slugified filenames from various sources
- **🔢 File Metadata**: Extracts file extension, size, and additional metadata
- **📊 Comprehensive Search**: Searches parent elements, siblings, and hidden elements for file information

### Export & Download Options

- **⬇️ Bulk Downloads**: Download all found documents with one click
- **📊 CSV Export**: Export link data to spreadsheet-friendly CSV format
- **🌐 HTML Snippet Generation**: Create ready-to-use HTML code for embedding links
- **🔧 Customizable Output**: Configure media prefixes and output formats

### Advanced Configuration

- **⚙️ Persistent Settings**: All preferences are saved automatically
- **🎨 Custom CSS Selectors**: Target specific elements with custom selectors
- **🔄 Inner Content Toggle**: Choose whether to include link text in exports
- **📁 Media Prefixes**: Configure custom prefixes for exported links

## 🛠️ How It Works

1. **Navigate** to any webpage containing document links
2. **Click** the extension icon to open the popup
3. **Configure** your extraction settings (or use defaults)
4. **Extract** links with one click
5. **Download** files individually or in bulk
6. **Export** data as CSV or HTML snippets

## ⚙️ Configuration Options

### File Extensions
Configure which file types to extract:
```
pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, rtf, odt
```

### CSS Selectors
Target specific elements on pages:
```
a[href], a[data-href], a[data-download], .download-link
```

### Media Prefixes
- **XLSX Prefix**: Used in CSV export for media constants
- **HTML Prefix**: Used in HTML snippet generation

### Extraction Settings
- **Include Inner Content**: Extract link text and titles
- **Make Absolute URLs**: Convert relative URLs to absolute

## 📊 Export Formats

### CSV Export
Includes columns:
- `original_url`: The source URL
- `title`: Link text/title if available
- `slugified_filename_with_ext`: Clean filename with extension
- `slugified_filename_no_ext`: Clean filename without extension
- `media_constant`: Prefixed filename for media systems
- `file_size_human`: Human-readable file size
- `tooltip`: Descriptive tooltip text
- `extension`: File extension
- `status`: Extraction status

### HTML Snippet
Generates ready-to-use HTML with:
- Bootstrap-compatible classes
- Accessibility attributes
- File size and type information
- Target="_blank" for external links
- **Sitecore-optimized markup** with proper media library paths

## 🏢 Sitecore CMS Integration

This extension is specially optimized for **Sitecore CMS environments**:

### Sitecore-Specific Features
- **Media Library Path Recognition**: Automatically detects Sitecore media library URLs (`/sitecore/media library/...`)
- **Media Prefix Configuration**: Built-in support for Sitecore media prefixes in exports
- **Sitecore Asset Detection**: Recognizes common Sitecore document patterns and structures
- **Clean URL Processing**: Handles Sitecore's URL parameters and media queries effectively

### Sitecore Use Cases
- **Content Auditing**: Extract all downloadable assets from Sitecore pages
- **Media Migration**: Generate inventories of media library documents
- **Asset Documentation**: Create comprehensive lists of available downloads
- **Quality Assurance**: Verify document availability and metadata accuracy

## 🔧 Technical Features

### Smart File Size Detection
The extension uses multiple strategies to find exact file sizes:
- Data attributes (`data-size`, `data-filesize`, etc.)
- Parent element text analysis
- Sibling element scanning
- Aria-label and title attributes
- Hidden size elements
- Multiple regex patterns for size formats

### Filename Processing
- Automatic slugification for safe filenames
- Duplicate extension prevention
- Fallback filename generation
- Special character handling

### Error Handling
- Graceful failure for inaccessible content
- Detailed error logging
- User-friendly error messages
- Automatic retry mechanisms

## 🚨 Current Limitations

As this is an **early stage extension**, please note:

- Some websites may block content script injection
- Complex JavaScript-generated links might not be detected
- File size detection depends on page markup
- Large pages may take time to process
- Some downloads may be blocked by browser security

## 🔮 Planned Features

- [ ] Real-time file size verification via HEAD requests
- [ ] Progress indicators for large extractions
- [ ] Filter and search capabilities
- [ ] Custom export templates
- [ ] Integration with cloud storage services
- [ ] Batch processing for multiple tabs
- [ ] Advanced link validation
- [ ] Custom filename patterns

## 🐛 Bug Reports & Feature Requests

This extension is in active development. Please report issues or suggest features through the appropriate channels.

## 📄 Privacy & Permissions

The extension requires:
- **Active tab access**: To read page content and extract links
- **Downloads permission**: To save files and export data
- **Storage permission**: To save user preferences

**No data is transmitted externally** - all processing happens locally in your browser.

## 🚀 Installation

*Installation instructions will be added when the extension is published to the Chrome Web Store.*

---

**Version**: Early Development  
**Compatibility**: Chrome 88+  
**License**: TBD

> **Note**: This extension is designed for legitimate research and content management purposes. Please respect website terms of service and copyright laws when downloading content.
