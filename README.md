# Paddle Drive OCR POC

A local upload/download/search proof of concept with a Drive-style UI and PaddleOCR-backed text indexing.

## Run

```bash
python3 -m pip install -r requirements.txt
python3 app/server.py
```

Then open `http://127.0.0.1:8765`.

Uploaded files are stored in `uploads/`. Metadata and OCR text are stored in `data/paddle_drive.sqlite3`.

## Notes

- Image files (`png`, `jpg`, `jpeg`, `webp`, `bmp`, `tiff`) are queued for PaddleOCR.
- Word (`docx`) and Excel (`xlsx`) files are indexed by extracting their embedded text directly.
- Other files are still stored and downloadable, but marked as download-only.
- PaddleOCR may download model files on first use.
