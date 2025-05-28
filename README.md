# Mole!

_A scrappy little guy that digs around for juicy projects. Can't see very well, but he tries his best._

---

This project is built to help me review all the projects submitted for [High Seas](https://highseas.hackclub.com). There are 7.5k projects and only 1 of me & I want to hand review all the projects before approving them as "YSWS-worthy" projects.

---

## Installation

```sh
# install packages with uv
uv venv
source .venv/bin/activate  # On Unix/macOS
uv pip compile requirements.txt -o requirements.lock  # Generate lockfile
uv pip install -r requirements.lock
bun i

# install Playwright browsers
playwright install chromium --with-deps --no-shell

# start up everything
bun run server.js
```
