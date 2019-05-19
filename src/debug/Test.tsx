import * as React from 'react';
import * as ReactDOM from 'react-dom';
// import { Document, Page, Pdf } from "react-pdf/dist/entry.webpack";
import { computed, observable, action, runInAction } from 'mobx';
import Measure from 'react-measure';
import { RouteStore } from '../server/RouteStore';
import { observer } from 'mobx-react';
import * as Pdfjs from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { Opt } from '../fields/Field';
import "./Test.scss";
import { PDFViewer } from '../client/views/pdf/PDFViewer';

const options = {
    cMapUrl: 'cmaps/',
    cMapPacked: true
};

// @observer
// class Test extends React.Component {
//     @observable private file: string = 'http://projects.wojtekmaj.pl/react-pdf/static/sample.pdf';
//     // @observable private file: string = 'http://www.pdf995.com/samples/pdf.pdf';
//     @observable private numPages: number = 2;

//     @action
//     onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
//         if (event && event.target.files) {
//             let file = event.target.files.item(0);
//             if (file) {
//                 this.file = file.name;
//             }
//         }
//     }

//     onDocumentLoadSuccess = (pdf: Pdf) => {
//         if (pdf) {
//             this.numPages = pdf.numPages;
//         }
//     }

//     render() {
//         // let pdfUrl = "file:///C:/Users/Test/Desktop/layout.pdf";
//         // let pdfUrl = "http://cs.brown.edu/people/bcz/prairie.jpg";
//         let pdfUrl = new URL("http://www.pdf995.com/samples/pdf.pdf");
//         return (
//             <div className="Example">
//                 <header>
//                     <h1>react-pdf sample page</h1>
//                 </header>
//                 <div className="Example__container">
//                     <div className="Example__container__load">
//                         <label htmlFor="file">Load from file:</label>
//                         {' '}
//                         <input
//                             type="file"
//                             onChange={this.onFileChange}
//                         />
//                     </div>
//                     <div className="Example__container__document">
//                         <Document
//                             file={this.file}
//                             onLoadSuccess={this.onDocumentLoadSuccess}
//                             onSourceError={(error: Error) => {
//                                 console.log(error);
//                             }}
//                         >
//                             {
//                                 Array.from(
//                                     new Array(this.numPages),
//                                     (el, index) => (
//                                         <Page
//                                             key={`page_${index + 1}`}
//                                             pageNumber={index + 1}
//                                             onRenderError={(error: Error) => console.log(error)}
//                                         />
//                                     ),
//                                 )
//                             }
//                         </Document>
//                     </div>
//                 </div>
//             </div>
//         );
//     }
// }

const pdfUrl = window.origin + RouteStore.corsProxy + "/https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";

ReactDOM.render((
    <div className={`documentView-node`}
        style={{
            borderRadius: "inherit",
            width: "612px", height: "792px",
            transform: `scale(50%, 50%)`,
            overflow: "scroll"
        }}
    >
        <PDFViewer url={pdfUrl} />
    </div>
),
    document.getElementById('root')
);