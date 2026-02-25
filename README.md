# Discord Chat Exporter - Unlimited

A powerful, secure, and completely local Google Chrome extension designed to mass-download and backup your Discord server channels and Direct Messages without the risk of Account Bans or data leaks.

Built natively on top of the **Plasmo** framework, utilizing **React, TailwindCSS, and Shadcn UI**.

## ✨ Features

- **Zero-Config Token Sniffing:** Automatically detects your active Discord session token natively. No more copy-pasting developer tokens.
- **Unified Side Panel UI:** Operates elegantly within Chrome's native Side Panel for unobtrusive, seamless multitasking alongside your active Discord tab.
- **Server & DM Archival:** Safely read and cache full text histories for your Servers, Threads, and Direct Messages.
- **Granular Time control:** Download only what you need. Specify "Last 48 Hours", "2 Weeks", "3 Months", or "All Time" to minimize unnecessary API requests.
- **Anti-Ban Protection System:** Fully integrated random human-like delays, intelligent exponential backoffs, and strict rate-limit adherence to keep your Discord account 100% safe.
- **Local-First Data:** Your data NEVER leaves your browser. All cached messages are stored strictly within the extension's local Chrome storage sandbox.
- **CSV & JSON Exports:** Export any cached server instantly to robust, structured formats for external analysis or secure long-term safekeeping.
- **System Dark Mode:** The UI perfectly aligns with your operating system's light or dark mode theme.

## 🚀 Installation & Usage

1. **Download the latest release:** Grab the compiled `.zip` file from the [Releases](https://github.com/h4gen/discord-chat-exporter/releases) page.
2. **Access Extension Settings:** Open `chrome://extensions/` in your Chrome browser.
3. **Enable Developer Mode:** Toggle the "Developer mode" switch in the top right corner.
4. **Load Unpacked:** Click "Load unpacked" and select the unzipped `discord-chat-exporter` folder.
5. **Pin and Open:** Pin the extension to your toolbar and click it to open the Side Panel.

### Syncing Your Account

To begin, simply navigate to `discord.com/app` in your active tab. The extension's background service worker will instantly detect your secure session token. 

From the "Servers" tab in the Side Panel, simply check the boxes for the channels/DMs you wish to archive, select how far back you wish to scan, and click **Start Download**. 

## 🛠️ Development

This is a [Plasmo extension](https://docs.plasmo.com/) project. Ensure you have `pnpm` installed.

```bash
# Clone the repository
git clone https://github.com/h4gen/discord-chat-exporter.git
cd discord-chat-exporter

# Install dependencies
pnpm install

# Run the development server
pnpm dev
```

To create a production-ready package:

```bash
pnpm package
```
This will generate a highly optimized `.zip` archive inside the `build/` directory ready for the Chrome Web Store.

## 📝 License

This project is open-source and available under the standard MIT License. Data sovereignty belongs exclusively to the end user.
