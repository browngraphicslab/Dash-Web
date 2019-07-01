import React = require("react");
import { Doc, DocListCast, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { AnnotationTypes, Viewer, scale } from "./PDFViewer";
import { observer } from "mobx-react";
import { observable, IReactionDisposer, reaction, action } from "mobx";
import { BoolCast, NumCast, FieldValue, Cast, StrCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import PDFMenu from "./PDFMenu";
import { DocumentManager } from "../../util/DocumentManager";

interface IAnnotationProps {
    anno: Doc;
    index: number;
    parent: Viewer;
}

export default class Annotation extends React.Component<IAnnotationProps> {
    render() {
        let annotationDocs = DocListCast(this.props.anno.annotations);
        let res = annotationDocs.map(a => {
            let type = NumCast(a.type);
            switch (type) {
                // case AnnotationTypes.Pin:
                //     return <PinAnnotation parent={this} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
                case AnnotationTypes.Region:
                    return <RegionAnnotation parent={this.props.parent} document={a} index={this.props.index} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
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
    parent: Viewer;
    document: Doc;
}

@observer
class RegionAnnotation extends React.Component<IRegionAnnotationProps> {
    @observable private _backgroundColor: string = "red";

    private _reactionDisposer?: IReactionDisposer;
    private _scrollDisposer?: IReactionDisposer;
    private _mainCont: React.RefObject<HTMLDivElement>;

    constructor(props: IRegionAnnotationProps) {
        super(props);

        this._mainCont = React.createRef();
    }

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => BoolCast(this.props.document.delete),
            () => {
                if (BoolCast(this.props.document.delete)) {
                    if (this._mainCont.current) {
                        this._mainCont.current.style.display = "none";
                    }
                }
            },
            { fireImmediately: true }
        );

        this._scrollDisposer = reaction(
            () => this.props.parent.Index,
            () => {
                if (this.props.parent.Index === this.props.index) {
                    this.props.parent.scrollTo(this.props.y - 50);
                }
            }
        );
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
        this._scrollDisposer && this._scrollDisposer();
    }

    deleteAnnotation = () => {
        let annotation = DocListCast(this.props.parent.props.parent.Document.annotations);
        let group = FieldValue(Cast(this.props.document.group, Doc));
        if (group && annotation.indexOf(group) !== -1) {
            let newAnnotations = annotation.filter(a => a !== FieldValue(Cast(this.props.document.group, Doc)));
            this.props.parent.props.parent.Document.annotations = new List<Doc>(newAnnotations);
        }

        if (group) {
            let groupAnnotations = DocListCast(group.annotations);
            groupAnnotations.forEach(anno => anno.delete = true);
        }

        PDFMenu.Instance.fadeOut(true);
    }

    @action
    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 0) {
            let targetDoc = Cast(this.props.document.target, Doc, null);
            if (targetDoc) {
                DocumentManager.Instance.jumpToDocument(targetDoc, true);
            }
        }
        if (e.button === 2) {
            PDFMenu.Instance.Status = "annotation";
            PDFMenu.Instance.Delete = this.deleteAnnotation.bind(this);
            PDFMenu.Instance.Pinned = false;
            PDFMenu.Instance.AddTag = this.addTag.bind(this);
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
                    pointerEvents: "all",
                    backgroundColor: this.props.parent.Index === this.props.index ? "goldenrod" : StrCast(this.props.document.color)
                }}></div>
        );
    }
}