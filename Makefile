PY ?= .venv/bin/python

.PHONY: setup data web serve dev report all

setup:            ## create venv + install Python and web dependencies
	python3 -m venv .venv && $(PY) -m pip install -q -r requirements.txt
	cd web && npm install

data:             ## simulate -> train -> evaluate -> export dashboard JSON (~4 min)
	$(PY) -m eta.run

web:              ## build the dashboard into web/dist
	cd web && npm run build

serve:            ## API + built dashboard on http://localhost:8000
	$(PY) -m uvicorn api.main:app --port 8000

dev:              ## hot-reload dashboard on :5173 (run `make serve` too for what-if)
	cd web && npm run dev

report:           ## render docs/report.html -> docs/Report.pdf with headless Chrome
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer \
	  --print-to-pdf=docs/Report.pdf docs/report.html

all: setup data web serve
