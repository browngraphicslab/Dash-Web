import React = require("react");
import { action, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { DocumentManager } from "../../util/DocumentManager";
import PDFMenu from "./PDFMenu";
import "./Annotation.scss";
import { scale } from "./PDFViewer";
import { PresBox } from "../nodes/PresBox";

interface IAnnotationProps {
    anno: Doc;
    fieldExtensionDoc: Doc;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
    pinToPres: (document: Doc) => void;
}

export default class Annotation extends React.Component<IAnnotationProps> {
    render() {
        return DocListCast(this.props.anno.annotations).map(a => (
            <RegionAnnotation {...this.props} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />));
    }
}

interface IRegionAnnotationProps {
    x: number;
    y: number;
    width: number;
    height: number;
    fieldExtensionDoc: Doc;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
    pinToPres: (document: Doc) => void;
    document: Doc;
}

@observer
class RegionAnnotation extends React.Component<IRegionAnnotationProps> {
    private _reactionDisposer?: IReactionDisposer;
    private _brushDisposer?: IReactionDisposer;
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();

    @observable private _brushed: boolean = false;

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => this.props.document.delete,
            (del) => del && this._mainCont.current && (this._mainCont.current.style.display = "none"),
            { fireImmediately: true }
        );

        this._brushDisposer = reaction(
            () => FieldValue(Cast(this.props.document.group, Doc)) && Doc.IsBrushed(FieldValue(Cast(this.props.document.group, Doc))!),
            (brushed) => {
                if (brushed !== undefined) {
                    runInAction(() => this._brushed = brushed);
                }
            }
        )
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
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
        group && this.props.pinToPres(group);
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
        return (<div className="pdfAnnotation" onPointerDown={this.onPointerDown} ref={this._mainCont}
            style={{
                top: this.props.y,
                left: this.props.x,
                width: this.props.width,
                height: this.props.height,
                backgroundColor: this._brushed ? "green" : StrCast(this.props.document.color)
            }} />);
    }
}