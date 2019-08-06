import React = require("react");
import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { DocumentManager } from "../../util/DocumentManager";
import { PresentationView } from "../presentationview/PresentationView";
import PDFMenu from "./PDFMenu";
import "./Annotation.scss";
import { AnnotationTypes, scale } from "./PDFViewer";

interface IAnnotationProps {
    anno: Doc;
    index: number;
    ParentIndex: () => number;
    fieldExtensionDoc: Doc;
    scrollTo?: (n: number) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
}

export default class Annotation extends React.Component<IAnnotationProps> {
    render() {
        let annotationDocs = DocListCast(this.props.anno.annotations);
        let res = annotationDocs.map(a => {
            let type = NumCast(a.type);
            switch (type) {
                case AnnotationTypes.Region:
                    return <RegionAnnotation addDocTab={this.props.addDocTab} document={a} fieldExtensionDoc={this.props.fieldExtensionDoc} scrollTo={this.props.scrollTo} ParentIndex={this.props.ParentIndex} index={this.props.index} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
                default:
                    return <div></div>;
            }
        });
        return res;
    }
}

interface IRegionAnnotationProps {
    x: number;
    y: number;
    width: number;
    height: number;
    index: number;
    ParentIndex: () => number;
    fieldExtensionDoc: Doc;
    scrollTo?: (n: number) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
    document: Doc;
}

@observer
class RegionAnnotation extends React.Component<IRegionAnnotationProps> {
    @observable private _backgroundColor: string = "red";

    private _reactionDisposer?: IReactionDisposer;
    private _scrollDisposer?: IReactionDisposer;
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => this.props.document.delete,
            () => this.props.document.delete && this._mainCont.current && (this._mainCont.current.style.display = "none"),
            { fireImmediately: true }
        );

        this._scrollDisposer = reaction(
            () => this.props.ParentIndex(),
            () => this.props.ParentIndex() === this.props.index && this.props.scrollTo && this.props.scrollTo(this.props.y * scale)
        );
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
        this._scrollDisposer && this._scrollDisposer();
    }

    deleteAnnotation = () => {
        let annotation = DocListCast(this.props.fieldExtensionDoc.annotations);
        let group = FieldValue(Cast(this.props.document.group, Doc));
        if (group) {
            if (annotation.indexOf(group) !== -1) {
                let newAnnotations = annotation.filter(a => a !== FieldValue(Cast(this.props.document.group, Doc)));
                this.props.fieldExtensionDoc.annotations = new List<Doc>(newAnnotations);
            }

            DocListCast(group.annotations).forEach(anno => anno.delete = true);
        }

        PDFMenu.Instance.fadeOut(true);
    }

    pinToPres = () => {
        let group = FieldValue(Cast(this.props.document.group, Doc));
        group && PresentationView.Instance.PinDoc(group);
    }

    @action
    onPointerDown = async (e: React.PointerEvent) => {
        if (e.button === 0) {
            let targetDoc = await Cast(this.props.document.target, Doc);
            if (targetDoc) {
                let context = await Cast(targetDoc.targetContext, Doc);
                if (context) {
                    DocumentManager.Instance.jumpToDocument(targetDoc, false, false,
                        ((doc) => this.props.addDocTab(targetDoc!, undefined, e.ctrlKey ? "onRight" : "inTab")),
                        undefined, undefined);
                }
            }
        }
        if (e.button === 2) {
            PDFMenu.Instance.Status = "annotation";
            PDFMenu.Instance.Delete = this.deleteAnnotation.bind(this);
            PDFMenu.Instance.Pinned = false;
            PDFMenu.Instance.AddTag = this.addTag.bind(this);
            PDFMenu.Instance.PinToPres = this.pinToPres;
            PDFMenu.Instance.jumpTo(e.clientX, e.clientY, true);
        }
    }

    addTag = (key: string, value: string): boolean => {
        let group = FieldValue(Cast(this.props.document.group, Doc));
        if (group) {
            let valNum = parseInt(value);
            group[key] = isNaN(valNum) ? value : valNum;
            return true;
        }
        return false;
    }

    render() {
        return (
            <div className="pdfViewer-annotationBox" onPointerDown={this.onPointerDown} ref={this._mainCont}
                style={{
                    top: this.props.y * scale,
                    left: this.props.x * scale,
                    width: this.props.width * scale,
                    height: this.props.height * scale,
                    backgroundColor: this.props.ParentIndex() === this.props.index ? "green" : StrCast(this.props.document.color)
                }} />
        );
    }
}