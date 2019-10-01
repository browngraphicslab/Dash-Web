export interface ParsedPDF {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata: PDFMetadata;
    version: string; //https://mozilla.github.io/pdf.js/getting_started/
    text: string;
}

export interface PDFInfo {
    PDFFormatVersion: string;
    IsAcroFormPresent: boolean;
    IsXFAPresent: boolean;
    [key: string]: any;
}

export interface PDFMetadata {
    parse(): void;
    get(name: string): string;
    has(name: string): boolean;
}