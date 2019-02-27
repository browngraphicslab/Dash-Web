import 'react-image-lightbox/style.css'; 
import "./ImageBox.scss";
import React = require("react")
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react"
import { observable, action } from 'mobx';
import 'react-pdf/dist/Page/AnnotationLayer.css'
//@ts-ignore
import { Document, Page, PDFPageProxy, PageAnnotation} from "react-pdf";
import { Utils } from '../../Utils';
import { Sticky } from './Sticky'; 
import { Annotation } from './Annotation';

/** PDF has been moved to PDFNode now. This is now a dummy ImageBox that should be replaced with current
 * ImageBox. 
 */
@observer
export class ImageBox extends React.Component<FieldViewProps> {
    public static LayoutString() { return FieldView.LayoutString("ImageBox"); }
}