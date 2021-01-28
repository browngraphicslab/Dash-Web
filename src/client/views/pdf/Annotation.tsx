import React = require("react");
import { action, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { BoolCast, Cast, FieldValue, NumCast, PromiseValue, StrCast } from "../../../fields/Types";
import { LinkManager } from "../../util/LinkManager";
import { undoBatch } from "../../util/UndoManager";
import "./Annotation.scss";
import { AnchorMenu } from "./AnchorMenu";

interface IAnnotationProps {
    anno: Doc;
    addDocTab: (document: Doc, where: string) => boolean;
    pinToPres: (document: Doc, unpin?: boolean) => void;
    focus: (doc: Doc) => void;
    select: (isCtrlPressed: boolean) => void;
    dataDoc: Doc;
    fieldKey: string;
    showInfo: (anno: Opt<Doc>) => void;
}

@observer
export
    class Annotation extends React.Component<IAnnotationProps> {
    render() {
        return DocListCast(this.props.anno.annotations).map(a =>
            <RegionAnnotation {...this.props} showInfo={this.props.showInfo} select={this.props.select} pinToPres={this.props.pinToPres} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />);
    }
}

interface IRegionAnnotationProps {
    anno: Doc;
    x: number;
    y: number;
    width: number;
    height: number;
    addDocTab: (document: Doc, where: string) => boolean;
    pinToPres: (document: Doc, unpin: boolean) => void;
    select: (isCtrlPressed: boolean) => void;
    document: Doc;
    dataDoc: Doc;
    fieldKey: string;
    showInfo: (anno: Opt<Doc>) => void;
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

    @undoBatch
    deleteAnnotation = () => {
        const annotation = DocListCast(this.props.dataDoc[this.props.fieldKey + "-annotations"]);
        const group = FieldValue(Cast(this.props.document.group, Doc));
        if (group) {
            if (annotation.indexOf(group) !== -1) {
                const newAnnotations = annotation.filter(a => a !== FieldValue(Cast(this.props.document.group, Doc)));
                this.props.dataDoc[this.props.fieldKey + "-annotations"] = new List<Doc>(newAnnotations);
            }

            DocListCast(group.annotations).forEach(anno => anno.delete = true);
        }

        AnchorMenu.Instance.fadeOut(true);
    }

    @undoBatch
    pinToPres = () => {
        const group = FieldValue(Cast(this.props.document.group, Doc));
        const isPinned = group && Doc.isDocPinned(group) ? true : false;
        group && this.props.pinToPres(group, isPinned);
    }

    @undoBatch
    makePushpin = action(() => {
        const group = Cast(this.props.document.group, Doc, null);
        group.isPushpin = !group.isPushpin;
    });

    isPushpin = () => BoolCast(Cast(this.props.document.group, Doc, null)?.isPushpin);

    @action
    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 2 || e.ctrlKey) {
            AnchorMenu.Instance.Status = "annotation";
            AnchorMenu.Instance.Delete = this.deleteAnnotation.bind(this);
            AnchorMenu.Instance.Pinned = false;
            AnchorMenu.Instance.AddTag = this.addTag.bind(this);
            AnchorMenu.Instance.PinToPres = this.pinToPres;
            AnchorMenu.Instance.MakePushpin = this.makePushpin;
            AnchorMenu.Instance.IsPushpin = this.isPushpin;
            AnchorMenu.Instance.jumpTo(e.clientX, e.clientY, true);
            e.stopPropagation();
        }
        else if (e.button === 0) {
            e.persist();
            e.stopPropagation();
            PromiseValue(this.props.document.group).then(annoGroup => annoGroup instanceof Doc &&
                LinkManager.traverseLink(undefined, annoGroup, (doc, followLinkLocation) => this.props.addDocTab(doc, e.ctrlKey ? "add" : followLinkLocation), false, undefined,
                    () => this.props.select(false))
            );
        }
    }


    addTag = (key: string, value: string): boolean => {
        const group = FieldValue(Cast(this.props.document.group, Doc));
        if (group) {
            const valNum = parseInt(value);
            group[key] = isNaN(valNum) ? value : valNum;
            return true;
        }
        return false;
    }

    @observable _showInfo = false;
    render() {
        return (<div className="pdfAnnotation" onPointerEnter={action(() => this.props.showInfo(this.props.anno))} onPointerLeave={action(() => this.props.showInfo(undefined))} onPointerDown={this.onPointerDown} ref={this._mainCont}
            style={{
                top: this.props.y,
                left: this.props.x,
                width: this.props.width,
                height: this.props.height,
                opacity: !this._showInfo && this._brushed ? 0.5 : undefined,
                backgroundColor: this._brushed ? "orange" : StrCast(this.props.document.backgroundColor),
            }} >
        </div>);
    }
}