import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faBell, faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, Opt, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { ProxyField } from "../../../new_fields/Proxy";
import { RichTextField, ToPlainText } from "../../../new_fields/RichTextField";
import { Cast, NumCast } from "../../../new_fields/Types";
import { AudioField, ImageField, PdfField, VideoField, WebField } from "../../../new_fields/URLField";
import { emptyFunction, returnEmptyString, returnOne } from "../../../Utils";
import { Transform } from "../../util/Transform";
import { CollectionView } from "../collections/CollectionView";
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionTimelineView.scss";
import React = require("react");
import { Id } from "../../../new_fields/FieldSymbols";
import { DocumentContentsView } from '../nodes/DocumentContentsView';
import { SelectionManager } from "../../util/SelectionManager";
import { UndoManager, undoBatch } from "../../util/UndoManager";


@observer
export class
    Thumbnail extends React.Component<NodeProps> {

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


    
    
leSelection(e: React.PointerEvent) {
        this.props.timelinedoc.currdoc = this.props.doc;
    .props.timelinedoc.currval = this.props.doc[this.props.sortstate];


ion
    toggletwo() {
        this.selectclass = !this.selectclass;
}
    
@action
    adjust = (e: PointerEvent): void => {
    this.props.doc[this.props.sortstate] = NumCast(this.props.doc[this.props.sortstate]) + e.movementX / this.props.range;
    }

    onPointerUp = (e: PointerEvent): void => {
    document.removeEventListener("pointermove", this.adjust);
}
    
        
        ta() {
    return this.props.doc.data;
    

@observable classref = React.createRef<HTMLDivElement>();

    @observable caption: string = "No caption";

@computed
    selectclass() {
    if (this.newclass === undefined) {
            this.newclass = this.props.select;
        }
        else if (this.props.select === true) {
        return true;
    }

    return this.newclass;
}

set selectclass(boolean: boolean) {
    this.newclass = boolean;
}

@observable newclass: boolean | undefined;

@observable left: number | undefined;

@computed
get leftval(): number {
    if (this.left === undefined) {
        this.left = this.props.leftval;
        return this.left;
    }
    return this.left;

}



set leftval(number) {
    this.left = number;
}

    private calculatepreview() {
        if (!this.props.rangeval) {
            console.log(this.props.doc[this.props.sortstate]);
            return this.props.doc[this.props.sortstate]
        }
        return Math.round(NumCast(this.props.doc[this.props.sortstate]))
    }
    render() {
        return (
            <div>
                <div onPointerDown={(e) => this.toggleSelection(e)} style={{
                    zIndex: 1, position: "absolute", left: this.props.leftval * this.props.transform, top: this.props.top, width: this.props.scale, height: this.props.scale,
                }}>
                    <div className="unselected" style={{ position: "absolute", zIndex: 11, width: this.props.scale, height: this.props.scale, pointerEvents: "all" }}>
                        <FontAwesomeIcon icon={this.checkData(this.props.doc)} size="sm" style={{ position: "absolute" }} />
                        <div className="window" style={{ pointerEvents: "none", zIndex: 10, width: this.props.scale - 3, height: this.props.scale - 3, position: "absolute", overflow: "hidden" }}>
                            <div className="collectionSchemaView-previewDoc" style={{ width: this.props.scale - 3, height: this.props.scale - 3, overflow: "hidden" }}>
                                <DocumentContentsView
                                    ContainingCollectionView={this.props.CollectionView}
                                    ContainingCollectionDoc={this.props.doc}
                                    ruleProvider={undefined} pinToPres={this.props.pinToPres}
                                    Document={this.props.doc}
                                    isSelected={() => false}
                                    select={(isCtrlPressed: boolean) => { }}
                                    ScreenToLocalTransform={() => new Transform(0, 0, 1)}
                                    renderDepth={this.props.renderDepth + 1}
                                    PanelWidth={() => (this.props.scale - 3)}
                                    PanelHeight={() => this.props.scale - 3}
                                    ContentScaling={() => 1}
                                    focus={emptyFunction}
                                    layoutKey={"layout"}
                                    onClick={undefined}
                                    backgroundColor={returnEmptyString}
                                    parentActive={this.props.active}
                                    bringToFront={emptyFunction}
                                    whenActiveChanged={this.props.whenActiveChanged}
                                    addDocTab={this.props.addDocTab}
                                    zoomToScale={emptyFunction}
                                    getScale={returnOne}
                                />
                                <div className="window" style={{ background: "transparent", top: 0, left: 0, pointerEvents: "all", zIndex: 2, position: "absolute", width: this.props.scale - 6, height: this.props.scale - 6 }} />

                            </div>                        </div >
                    </div >
                </div >

                <div ref={this.classref} className={this.selectclass === true ? "selection " : "unselection"} style={{
                    zIndex: 98, position: "absolute", height: "100%",
                }}>
                    <div style=
                        {{
                            position: "absolute", left: this.props.leftval * this.props.transform, top: "0px", height: "100%", overflow: "hidden", writingMode: "vertical-rl",
                            textOrientation: "mixed", borderLeft: "1px black solid",
                        }} />
                    < div style={{
                        position: "absolute", height: this.props.scale, width: this.props.scale, left: this.props.leftval * this.props.transform - this.props.scale, paddingTop: 10, top: this.props.timelineTop, overflow: "hidden", writingMode: "vertical-rl",
                        textOrientation: "mixed",
                    }}>{this.calculatepreview()}</div>
                </div>
            </div >
        );
    }
}

export interface NodeProps {
    scale: number;
    leftval: number;
    sortstate: string;
    transform: number;
    doc: Doc;
    top: number;
    renderDepth: number;
    createportal: (() => void) | undefined;
    CollectionView: Opt<CollectionView>;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    scrollTop: number;
    transition: boolean;
    toggleopac: boolean;
    timelineTop: number;
    select: boolean;
    update: boolean;
    range: number;
    rangeval: boolean;
    sethover: (doc: Doc) => void;
    timelinedoc: Doc;
}