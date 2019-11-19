import React = require("react");
import { action, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, WidthSym, Opt, DocListCastAsync } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { DocumentManager } from "../../util/DocumentManager";
import PDFMenu from "./PDFMenu";
import "./Annotation.scss";

interface IAnnotationProps {
    anno: Doc;
    extensionDoc: Doc;
    addDocTab: (document: Doc, dataDoc: Opt<Doc>, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    focus: (doc: Doc) => void;
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
    extensionDoc: Doc;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => boolean;
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
            () => FieldValue(Cast(this.props.document.group, Doc)) && Doc.isBrushedHighlightedDegree(FieldValue(Cast(this.props.document.group, Doc))!),
            brushed => brushed !== undefined && runInAction(() => this._brushed = brushed !== 0)
        );
    }

    componentWillUnmount() {
        this._brushDisposer && this._brushDisposer();
        this._reactionDisposer && this._reactionDisposer();
    }

    deleteAnnotation = () => {
        let annotation = DocListCast(this.props.extensionDoc.annotations);
        let group = FieldValue(Cast(this.props.document.group, Doc));
        if (group) {
            if (annotation.indexOf(group) !== -1) {
                let newAnnotations = annotation.filter(a => a !== FieldValue(Cast(this.props.document.group, Doc)));
                this.props.extensionDoc.annotations = new List<Doc>(newAnnotations);
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
        if (e.button === 2 || e.ctrlKey) {
            PDFMenu.Instance.Status = "annotation";
            PDFMenu.Instance.Delete = this.deleteAnnotation.bind(this);
            PDFMenu.Instance.Pinned = false;
            PDFMenu.Instance.AddTag = this.addTag.bind(this);
            PDFMenu.Instance.PinToPres = this.pinToPres;
            PDFMenu.Instance.jumpTo(e.clientX, e.clientY, true);
            e.stopPropagation();
        }
        else if (e.button === 0) {
            let annoGroup = await Cast(this.props.document.group, Doc);
            if (annoGroup) {
                DocumentManager.Instance.FollowLink(undefined, annoGroup,
                    (doc: Doc, maxLocation: string) => this.props.addDocTab(doc, undefined, e.ctrlKey ? "inTab" : "onRight"),
                    false, false, undefined);
                e.stopPropagation();
            }
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
                opacity: this._brushed ? 0.5 : undefined,
                backgroundColor: this._brushed ? "orange" : StrCast(this.props.document.backgroundColor),
                transition: "opacity 0.5s",
            }} />);
    }
}