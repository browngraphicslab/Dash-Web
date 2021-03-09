import React = require("react");
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { BoolCast, Cast, NumCast, StrCast } from "../../../fields/Types";
import { LinkManager } from "../../util/LinkManager";
import { undoBatch } from "../../util/UndoManager";
import { FieldViewProps } from "../nodes/FieldView";
import { AnchorMenu } from "./AnchorMenu";
import "./Annotation.scss";

interface IAnnotationProps extends FieldViewProps {
    anno: Doc;
    dataDoc: Doc;
    fieldKey: string;
    showInfo: (anno: Opt<Doc>) => void;
}
@observer
export
    class Annotation extends React.Component<IAnnotationProps> {
    render() {
        return DocListCast(this.props.anno.textInlineAnnotations).map(a =>
            <RegionAnnotation {...this.props} showInfo={this.props.showInfo} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />);
    }
}

interface IRegionAnnotationProps extends IAnnotationProps {
    x: number;
    y: number;
    width: number;
    height: number;
    document: Doc;
}
@observer
class RegionAnnotation extends React.Component<IRegionAnnotationProps> {
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();

    @observable _brushed: boolean = false;
    @computed get annoTextRegion() { return Cast(this.props.document.annoTextRegion, Doc, null) || this.props.document; }

    componentDidMount() {
        this._disposers.brush = reaction(
            () => this.annoTextRegion && Doc.isBrushedHighlightedDegree(this.annoTextRegion),
            brushed => brushed !== undefined && runInAction(() => this._brushed = brushed !== 0)
        );
    }

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
    }

    @undoBatch
    deleteAnnotation = () => {
        const docAnnotations = DocListCast(this.props.dataDoc[this.props.fieldKey]);
        this.props.dataDoc[this.props.fieldKey] = new List<Doc>(docAnnotations.filter(a => a !== this.annoTextRegion));
        AnchorMenu.Instance.fadeOut(true);
        this.props.select(false);
    }

    @undoBatch
    pinToPres = () => this.props.pinToPres(this.annoTextRegion);

    @undoBatch
    makePushpin = () => this.annoTextRegion.isPushpin = !this.annoTextRegion.isPushpin;

    isPushpin = () => BoolCast(this.annoTextRegion.isPushpin);

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
            e.stopPropagation();
            LinkManager.FollowLink(undefined, this.annoTextRegion, this.props, false);
        }
    }

    addTag = (key: string, value: string): boolean => {
        const valNum = parseInt(value);
        this.annoTextRegion[key] = isNaN(valNum) ? value : valNum;
        return true;
    }

    render() {
        return (<div className="pdfAnnotation" onPointerEnter={() => this.props.showInfo(this.props.anno)} onPointerLeave={() => this.props.showInfo(undefined)} onPointerDown={this.onPointerDown} ref={this._mainCont}
            style={{
                top: this.props.y,
                left: this.props.x,
                width: this.props.width,
                height: this.props.height,
                opacity: this._brushed ? 0.5 : undefined,
                backgroundColor: this._brushed ? "orange" : StrCast(this.props.document.backgroundColor),
            }} >
        </div>);
    }
}