import { observable, action, runInAction } from "mobx";
import React = require("react");
import "./CollectionTimelineView.scss";
import { Doc, DocListCast, Field, FieldResult, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { Transform } from "../../util/Transform";
import { NumCast, Cast, StrCast, } from "../../../new_fields/Types";
import { DocumentView } from "../nodes/DocumentView";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { RichTextField, ToPlainText, FromPlainText } from "../../../new_fields/RichTextField";
import { ImageField, VideoField, AudioField, PdfField, WebField } from "../../../new_fields/URLField";
import { faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faBell } from '@fortawesome/free-solid-svg-icons';
import { ProxyField } from "../../../new_fields/Proxy";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { EditableView } from "../EditableView";
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import { emptyFunction, Utils, returnOne, returnEmptyString } from "../../../Utils";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { CollectionView } from "../collections/CollectionView";
import { observer } from "mobx-react";
import { ellipsis } from "prosemirror-inputrules";


@observer
export class Thumbnail extends React.Component<NodeProps> {

    @action
    checkData = (document: Doc): IconProp => {
        let field = document.data;
        if (field instanceof AudioField) { return faMusic; }
        else if (field instanceof PdfField) { return faFilePdf; }
        else if (field instanceof RichTextField) { return faFont; }
        else if (field instanceof ImageField) { return faImage; }
        else if (field instanceof VideoField) { return faFilm; }
        else if (field instanceof WebField) { return faGlobeAsia; }
        else if (field instanceof ProxyField) { return faObjectGroup; }
        return faBell;
    }

    documentDisplay(d: Doc, width: number, height: number) {
        let nativeWidth = NumCast(d.nativeWidth, width);
        let nativeHeight = NumCast(d.nativeHeight, height);
        let wscale = width / (nativeWidth ? nativeWidth : width);
        if (wscale * nativeHeight > height) {
            wscale = height / (nativeHeight ? nativeHeight : height);
        }
        let contentScaling = () => wscale;
        let transform = () => new Transform(0, 0, 1);
        let getTransform = () => transform().translate(-centeringOffset, 0).scale(1 / contentScaling());
        let centeringOffset = () => (width - nativeWidth * contentScaling()) / 2;
        return (
            <div className="collectionSchemaView-previewDoc" style={{ transform: `translate(${centeringOffset}px, 0px)`, width: width - 3, height: height - 3, overflow: "hidden" }}>
                <DocumentView
                    pinToPres={this.props.pinToPres}
                    Document={d}
                    selectOnLoad={false}
                    ScreenToLocalTransform={getTransform}
                    ContentScaling={contentScaling}
                    PanelWidth={() => width} PanelHeight={() => height}
                    ContainingCollectionView={this.props.CollectionView}
                    focus={emptyFunction}
                    parentActive={this.props.active}
                    whenActiveChanged={this.props.whenActiveChanged}
                    bringToFront={emptyFunction}
                    addDocTab={this.props.addDocTab}
                    renderDepth={0}
                    zoomToScale={emptyFunction}
                    getScale={returnOne}
                    backgroundColor={returnEmptyString}
                />
            </div>);
    }

    @action
    captionupdate(doc: Doc, string: string) {
        doc = Doc.GetProto(doc);
        doc.caption = new RichTextField(RichTextField.Initialize(string));
        this.caption = string;
        return true;
    }

    getCaption() {
        let doc = Doc.GetProto(this.props.doc);
        let caption = Cast(doc.caption, RichTextField);
        runInAction(() => this.caption = caption ? caption[ToPlainText]() : "No Caption");
        return this.caption;
    }
    @action
    toggleSelection(e: React.PointerEvent) {
        if (this.classref.current!.classList.contains("unselection")) {
            this.classref.current!.classList.remove("unselection");
            this.classref.current!.classList.add("selection");
            this.props.tog(true);
        }
        else {
            this.classref.current!.classList.remove("selection");
            this.classref.current!.classList.add("unselection");
            this.props.tog(false);

        }
        if (e.altKey) {
            this.props.createportal();

        }
        let ting = this.props.leftval;
    }

    returnData() {
        return this.props.doc.data;
    }

    @observable selectclass: string = "unselection";

    @observable classref = React.createRef<HTMLDivElement>();

    @observable caption: string = "No caption";

    transitio: string = "";
    @action
    maketransition() {
        this.props.transition ? this.transitio = "1s left ease, 1s top ease, 1s opacity ease" : this.transitio = "1s opacity ease";
    }

    @action
    tog() {
        console.log(this.props.toggleopac);
        if (this.classref.current) {
            if (this.props.toggleopac === true && this.classref.current.classList.contains("unselection")) {
                this.opacity = 0.3;
            }
            else {
                this.opacity = 1;
            }
        }
        console.log(this.opacity);
    }

    opacity: number | undefined;

    render() {
        this.maketransition();
        this.getCaption();
        this.tog();
        return (
            <div onClick={(e) => this.toggleSelection(e)} style={{ transition: this.transitio, opacity: (this.opacity ? this.opacity : 1), position: "absolute", left: this.props.leftval, top: this.props.top, width: this.props.scale, height: this.props.scale }}>
                <div className="unselected" style={{ position: "absolute", width: this.props.scale, height: this.props.scale, pointerEvents: "all" }}>
                    <FontAwesomeIcon icon={this.checkData(this.props.doc)} size="sm" style={{ position: "absolute" }} />
                    <div className="window" style={{ pointerEvents: "none", zIndex: 10, width: this.props.scale - 3, height: this.props.scale - 3, position: "absolute" }}>
                        <div className="window" style={{ background: "white", pointerEvents: "none", zIndex: -1, position: "absolute", width: this.props.scale - 6, height: this.props.scale - 6 }}>
                            {this.documentDisplay(this.props.doc, this.props.scale - 3, this.props.scale - 3)}
                        </div>
                    </div>
                </div>
                <div ref={this.classref} className="unselection" style={{
                    zIndex: 98, position: "absolute", top: this.props.scale,
                }}>
                    <div style={{
                        border: "3px solid #9c9396",
                        backgroundColor: "9c9396",
                        borderRadius: "10px 10px 0px 0px",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis", position: "absolute", overflow: "hidden", paddingLeft: "3px", paddingRight: "3px", paddingTop: "3px", top: -30 - this.props.scale, zIndex: 99, width: this.props.scale, height: "30px"
                    }}> {this.props.doc.title}</div>
                    <div style={{ width: this.props.scale, height: "30", border: "3px solid #9c9396", borderRadius: "0px 0px 10px 0px", }}>
                        <EditableView
                            contents={this.caption}
                            SetValue={(strng) => this.captionupdate(this.props.doc, strng)}
                            GetValue={() => this.caption}
                            display={"inline"}
                            height={30}
                            oneLine={true}
                        />
                    </div>
                    <div style={{ height: "100% ", alignItems: "center", justifyItems: "center", display: "flex", position: "fixed", width: "1px", zIndex: -400, backgroundColor: "#9c9396" }}>
                    </div>
                    <div style={{ height: "100% ", alignItems: "center", justifyItems: "center", display: "flex", top: "-" + String(this.props.top), position: "fixed", width: "1px", zIndex: -400, backgroundColor: "#9c9396" }}>
                    </div>
                    <div style={{ paddingLeft: "3px", width: this.props.scale, overflow: "hidden" }}>
                        {this.props.sortstate}:{Math.round(NumCast(this.props.doc[this.props.sortstate]))}</div>
                </div>
            </div >
        );

    }
}

export interface NodeProps {
    scale: number;
    leftval: number;
    sortstate: string;
    doc: Doc;
    top: number;
    timelinetop: number;
    createportal: () => void;
    CollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => void;
    pinToPres: (document: Doc) => void;
    scrollTop: number;
    docheight: number;
    transition: boolean;
    toggleopac: boolean;
    tog: (booelan: boolean) => void;
}