# Converter

Converter is a **Node.js web application** with a static JavaScript frontend. There is no Flask or Python runtime required.

The browser interface is rendered by `static/app.js`, while `server.js` provides the Node.js API routes for image conversion, video/audio conversion, and YouTube conversion jobs.

## Requirements

Install the following tools before running the app:

| Tool | Purpose |
|---|---|
| Node.js 20 or later | Runs the JavaScript server and frontend toolchain. |
| npm or pnpm | Installs JavaScript dependencies. |
| FFmpeg on the system PATH | Processes local video, GIF, and audio conversions. |

## Run locally

```powershell
# Clone or open the repository folder.
cd jim2op-converter

# Install the Node.js dependencies.
pnpm install

# Start the Node.js development server.
pnpm dev
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000) on the same computer. The command-line output confirms that the server is running.

To run without automatic restarts, use:

```powershell
pnpm start
```

## Application structure

| Location | Responsibility |
|---|---|
| `server.js` | Express server, file upload API, Sharp image conversion, FFmpeg media conversion, and YouTube conversion jobs. |
| `static/index.html` | Static application shell. |
| `static/app.js` | Client-side routes, UI state, local previews, status feedback, and API requests. |
| `static/style.css` | Shared responsive light and dark UI styling. |
| `test/server.test.js` | Node.js tests for the static shell and converter API contract. |

## Tests

Run the JavaScript test suite with:

```powershell
pnpm test
```

## Access from another device

The server binds to all local network interfaces. Find your computer’s local IPv4 address with `ipconfig`, then open `http://YOUR-IP:5000` from another device on the same network. If Windows prompts for firewall access, allow Node.js on private networks.
