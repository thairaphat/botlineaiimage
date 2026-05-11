import sys
import logging
import os
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from pathlib import Path

os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_use_onednn", "0")
os.environ.setdefault("FLAGS_enable_pir_api", "0")
os.environ.setdefault("OMP_NUM_THREADS", "1")

# Suppress PaddleOCR logging to keep stdout clean
logging.getLogger("ppocr").setLevel(logging.ERROR)

try:
    import cv2
except ImportError as e:
    sys.stderr.write(f"OCR dependency missing: {e}")
    sys.exit(1)


def log(message):
    sys.stderr.write(f"{message}\n")


@contextmanager
def suppress_native_output():
    stdout_fd = os.dup(1)
    stderr_fd = os.dup(2)

    try:
        with open(os.devnull, "w", encoding="utf-8") as sink:
            os.dup2(sink.fileno(), 1)
            os.dup2(sink.fileno(), 2)
            yield
    finally:
        os.dup2(stdout_fd, 1)
        os.dup2(stderr_fd, 2)
        os.close(stdout_fd)
        os.close(stderr_fd)


def ensure_debug_dir():
    debug_dir = Path.cwd() / "uploads" / "debug-ocr"
    debug_dir.mkdir(parents=True, exist_ok=True)
    return debug_dir


def preprocess_image(image, scale=2):
    height, width = image.shape[:2]
    resized = cv2.resize(
        image,
        (width * scale, height * scale),
        interpolation=cv2.INTER_CUBIC,
    )

    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    blur = cv2.GaussianBlur(gray, (0, 0), 1.0)
    sharpened = cv2.addWeighted(gray, 1.5, blur, -0.5, 0)

    return sharpened


def build_regions(image):
    height, width = image.shape[:2]
    margin_x = max(int(width * 0.04), 1)

    regions = [
        ("full", image),
        ("center", image[:, margin_x : width - margin_x]),
    ]

    return [(name, region) for name, region in regions if region.size > 0]


def extract_text(result, depth=0):
    text_items = []

    if result is None or depth > 8:
        return text_items

    if hasattr(result, "json") and callable(result.json):
        try:
            return extract_text(result.json, depth + 1)
        except Exception:
            pass
    elif hasattr(result, "json"):
        return extract_text(result.json, depth + 1)

    if hasattr(result, "to_dict") and callable(result.to_dict):
        try:
            return extract_text(result.to_dict(), depth + 1)
        except Exception:
            pass

    if isinstance(result, dict):
        for key in ("rec_texts", "texts"):
            value = result.get(key)
            if isinstance(value, list):
                for item in value:
                    text = str(item).strip()
                    if text:
                        text_items.append(text)

        for key in ("rec_text", "text"):
            value = result.get(key)
            if isinstance(value, str):
                text = value.strip()
                if text:
                    text_items.append(text)

        for value in result.values():
            if isinstance(value, (dict, list, tuple)):
                text_items.extend(extract_text(value, depth + 1))

        return text_items

    if isinstance(result, (list, tuple)):
        # PaddleOCR v2 style: [[box, ("text", score)], ...]
        if len(result) > 1 and isinstance(result[1], tuple) and result[1]:
            text = str(result[1][0]).strip()
            if text:
                text_items.append(text)

        for item in result:
            text_items.extend(extract_text(item, depth + 1))

    return text_items


def dedupe_text(items):
    seen = set()
    deduped = []

    for item in items:
        normalized = " ".join(item.lower().split())
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(item)

    return deduped


def get_paddle_ocr_class():
    with suppress_native_output():
        from paddleocr import PaddleOCR

    return PaddleOCR


def create_ocr(lang):
    init_options = [
        {
            "lang": lang,
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
        },
        {
            "lang": lang,
            "use_textline_orientation": False,
        },
        {"lang": lang},
    ]

    with suppress_native_output():
        PaddleOCR = get_paddle_ocr_class()
        last_error = None
        for options in init_options:
            try:
                return PaddleOCR(**options)
            except TypeError as e:
                last_error = e

        raise last_error


def run_ocr(ocr, image_path):
    with suppress_native_output():
        try:
            return extract_text(ocr.predict(str(image_path)))
        except NotImplementedError:
            return extract_text(ocr.ocr(str(image_path)))


def run_tesseract_image(image):
    try:
        import pytesseract
    except ImportError:
        log("Tesseract executable not found")
        return [], False

    try:
        if os.name == "nt":
            tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
            if os.path.exists(tesseract_path):
                pytesseract.pytesseract.tesseract_cmd = tesseract_path

        text = pytesseract.image_to_string(image, lang="eng+tha")
        text = " ".join(text.split())
        return ([text] if text else []), True
    except pytesseract.pytesseract.TesseractNotFoundError:
        log("Tesseract executable not found")
        return [], False
    except Exception as e:
        log(f"[OCR warning] tesseract failed: {type(e).__name__}")
        return [], True


def run_tesseract_regions(regions, debug_dir, source_stem):
    all_text = []
    tesseract_available = True

    for region_name, region in regions:
        processed = preprocess_image(region, scale=2)
        debug_path = debug_dir / f"{source_stem}-{region_name}-tesseract.jpg"
        cv2.imwrite(str(debug_path), processed)

        text_items, tesseract_available = run_tesseract_image(processed)
        all_text.extend(text_items)

        if not tesseract_available:
            break

    return all_text, tesseract_available


def get_ocr_model(ocr_by_lang, lang):
    if lang not in ocr_by_lang:
        ocr_by_lang[lang] = create_ocr(lang)
    return ocr_by_lang[lang]


def run_regions_for_lang(lang, regions, debug_dir, source_stem, ocr_by_lang):
    all_text = []

    log(f"[OCR] lang={lang}")

    try:
        ocr = get_ocr_model(ocr_by_lang, lang)
    except Exception as e:
        log(f"[OCR warning] lang={lang} init failed: {type(e).__name__}")
        return all_text

    for region_name, region in regions:
        log(f"[OCR] region={region_name}")
        processed = preprocess_image(region, scale=2)
        debug_path = debug_dir / f"{source_stem}-{region_name}-grayscale.jpg"
        cv2.imwrite(str(debug_path), processed)

        try:
            all_text.extend(run_ocr(ocr, debug_path))
        except Exception as e:
            log(f"[OCR warning] {lang}/{region_name} failed: {type(e).__name__}")

        current_text = " ".join(dedupe_text(all_text))
        log(f"[OCR] text length={len(current_text)}")

    return all_text


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python scripts/ocr.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.exists(image_path):
        sys.stderr.write(f"File not found: {image_path}")
        sys.exit(1)

    try:
        log("[OCR] start")
        image = cv2.imread(image_path)
        if image is None:
            sys.stderr.write(f"Unable to read image: {image_path}")
            sys.exit(1)

        debug_dir = ensure_debug_dir()
        source_stem = Path(image_path).stem
        regions = build_regions(image)

        all_text, tesseract_available = run_tesseract_regions(regions, debug_dir, source_stem)
        output = " ".join(dedupe_text(all_text))
        log(f"[OCR] text length={len(output)}")

        log("[OCR] completed")
        print(output)
        return
    except Exception as e:
        sys.stderr.write(f"OCR failed: {type(e).__name__}")
        sys.exit(1)


if __name__ == "__main__":
    main()
