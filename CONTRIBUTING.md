# Contributing to Freesper

Thank you for your interest in contributing to Freesper! This document provides guidelines and setup instructions for contributors.

## Getting Started

### Prerequisites

- macOS 13.3+ (Ventura or later)
- Node.js 18+
- Xcode Command Line Tools
- SoX: `brew install sox`
- Python 3.9+ with librosa and numpy: `pip3 install librosa numpy`

### Setup

1. **Fork and clone**
```bash
git clone https://github.com/YOUR_USERNAME/freesper.git
cd freesper
```

2. **Install dependencies**
```bash
npm install
```

3. **Create configuration file**
```bash
cp .env.example .env
# Edit .env with your values (see below)
```

4. **Run in development mode**
```bash
npm run dev
```

## Configuration for Development

### Environment Variables

Create a `.env` file with the following:

```bash
# Required only if you plan to build and test releases
UPDATE_SERVER_URL=http://localhost:8080/

# Required only if you plan to notarize builds
APPLE_ID=your-email@apple.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

**Note**: You don't need to configure these for development. They're only required for:
- Building release packages
- Testing the auto-update system
- Notarizing the app for distribution

### Verifying Your Setup

```bash
# Check environment configuration (optional)
npm run check-env

# Run the app in dev mode
npm run dev
```

## Development Workflow

### Code Style

- Use ES6+ JavaScript
- Follow existing code patterns
- Add comments for complex logic
- Keep functions small and focused

### Testing Changes

1. **Run the app**
```bash
npm run dev
```

2. **Test features**
- Record audio with Cmd+Shift+Space
- Verify transcription works
- Check UI updates
- Test settings persistence

3. **Check logs**
```bash
# Development logs appear in terminal
# Production logs: ~/Library/Logs/freesper/
```

### Building

```bash
npm run build
```

The build will:
1. Download Python standalone (if needed)
2. Verify environment configuration
3. Build the macOS DMG and ZIP
4. Generate update manifest (if UPDATE_SERVER_URL is set)

**Note**: Building requires valid Apple Developer credentials for code signing.

## Project Structure

```
Freesper/
├── src/
│   ├── main.js              # Electron main process
│   └── modules/
│       ├── audioRecorder.js    # Audio capture
│       ├── inferenceEngine.js  # ML inference
│       ├── modelManager.js     # Model downloads
│       ├── updateManager.js    # Auto-update system
│       └── ...
├── ui/
│   ├── index.html           # Main UI
│   ├── setup.html           # Setup wizard
│   └── update.html          # Update notification
├── scripts/
│   ├── generate-update-manifest.js  # Build helper
│   └── upload-to-minio.sh          # Deploy helper
└── assets/
    └── sounds/              # Audio feedback sounds
```

## Contributing Guidelines

### Pull Request Process

1. **Create a feature branch**
```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**
- Write clear commit messages
- Keep commits atomic (one logical change per commit)
- Add documentation for new features

3. **Test thoroughly**
- Test on Apple Silicon (M1/M2/M3)
- Test with different models
- Verify no regressions

4. **Submit PR**
- Describe what your PR does
- Link related issues
- Include screenshots for UI changes

### Commit Messages

Use clear, descriptive commit messages:

```
Good:
✓ Fix audio recording on macOS Sonoma
✓ Add support for Whisper large-v3
✓ Improve transcription accuracy for French

Bad:
✗ Fix bug
✗ Update code
✗ WIP
```

## Areas for Contribution

### High Priority

- [ ] Streaming transcription (real-time)
- [ ] Improved error handling and user feedback
- [ ] Additional model support
- [ ] Performance optimizations
- [ ] Better test coverage

### Medium Priority

- [ ] UI/UX improvements
- [ ] Settings enhancements
- [ ] Documentation improvements
- [ ] Localization (i18n)

### Low Priority

- [ ] Windows/Linux support
- [ ] Custom vocabulary support
- [ ] Theme customization

## Auto-Update System (for Fork Maintainers)

If you're maintaining a fork and want to distribute it:

1. **Configure your update server**
   - Set up MinIO, web server, or GitHub Releases
   - Configure `.env` with your server URL

2. **Apple Developer Account**
   - Required for code signing and notarization
   - Get an Apple ID: https://developer.apple.com/
   - Create app-specific password: https://appleid.apple.com/

3. **Build and distribute**
```bash
npm version patch
npm run build
./scripts/upload-to-minio.sh  # or your upload method
```

## Getting Help

- **Questions**: Open a discussion on GitHub
- **Bugs**: Open an issue with reproduction steps
- **Features**: Open an issue with use case description

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on what's best for the project
- Show empathy towards other contributors

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Freesper! 🎉
