import pdfplumber
import json

def debug_pdf(path):
    with pdfplumber.open(path) as pdf:
        text = pdf.pages[0].extract_text()
        table = pdf.pages[0].extract_table()
        
        with open('debug_text.txt', 'w') as f:
            f.write(text)
            
        with open('debug_table.json', 'w') as f:
            json.dump(table, f, indent=2)

if __name__ == "__main__":
    debug_pdf('media/agreements/vendor_agreement_sample.pdf')
