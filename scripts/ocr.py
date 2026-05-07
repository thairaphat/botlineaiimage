import sys
import logging
import os

# Suppress PaddleOCR logging to keep stdout clean
logging.getLogger("ppocr").setLevel(logging.ERROR)

try:
    from paddleocr import PaddleOCR
except ImportError:
    sys.stderr.write("paddleocr not installed")
    sys.exit(1)

def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        sys.stderr.write(f"File not found: {image_path}")
        sys.exit(1)
    
    try:
        # Initialize PaddleOCR with requested parameters
        ocr = PaddleOCR(lang='en', use_textline_orientation=True)
        result = ocr.ocr(image_path)
        
        if result is None or not result:
            print("")
            return

        all_text = []
        for line in result:
            if line:
                for res in line:
                    if isinstance(res, list) and len(res) > 1 and isinstance(res[1], tuple):
                        all_text.append(res[1][0])
        
        # Print combined text to stdout
        print(" ".join(all_text))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
