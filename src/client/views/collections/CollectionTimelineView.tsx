import React = require("react");
import { action, computed, IReactionDisposer, reaction, observable, untracked, ObservableMap } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym, DocListCast, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast, StrCast, Cast, FieldValue, } from "../../../new_fields/Types";
import { emptyFunction, returnOne, Utils, returnFalse } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { DocumentView, DocumentViewProps } from "../nodes/DocumentView";
import { CollectionSchemaPreview } from "./CollectionSchemaView";
import "./CollectionTimelineView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DateTimeStep } from "../../northstar/model/idea/idea";
import { date } from "serializr";
import { DateField } from "../../../new_fields/DateField";
import { List } from "../../../new_fields/List";
import { DocumentContentsView } from "../nodes/DocumentContentsView";
import { Transform } from "../../util/Transform";
import { CollectionView } from "./CollectionView";
import { CollectionPDFView } from "./CollectionPDFView";
import { CollectionVideoView } from "./CollectionVideoView";
import { VideoBox } from "../nodes/VideoBox";
import { faFilePowerpoint, faShower } from "@fortawesome/free-solid-svg-icons";
import { throwStatement } from "babel-types";


export interface FieldViewProps {
    fieldKey: string;
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Doc;
    isSelected: () => boolean;
    select: (isCtrlPressed: boolean) => void;
    isTopMost: boolean;
    selectOnLoad: boolean;
    addDocument?: (document: Doc, allowDuplicates?: boolean) => boolean;
    addDocTab: (document: Doc, where: string) => void;
    removeDocument?: (document: Doc) => boolean;
    moveDocument?: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    focus: (doc: Doc) => void;
    PanelWidth: () => number;
    PanelHeight: () => number;
    setVideoBox?: (player: VideoBox) => void;
}


@observer
class KeyToggle extends React.Component<{ keyName: string, toggle: (key: string) => void }> {
    constructor(props: any) {
        super(props);
    }

    render() {
        return (
            <div key={this.props.keyName}>
                <input type="radio" name="dude" onChange={() => this.props.toggle(this.props.keyName)} />
                {this.props.keyName}
            </div>
        );
    }
}

@observer
export class CollectionTimelineView extends CollectionSubView(doc => doc) {

    @computed get previewWidth() { return () => NumCast(this.props.Document.schemaPreviewWidth); }

    @observable
    private sortstate: String = "date";

    sortx(a: Doc, b: Doc) {
        return (a.x - b.x);
    }

    sorty(a: Doc, b: Doc) {
        return (a.y - b.y);
    }

    sortheight(a: Doc, b: Doc) {
        return (a.height - b.height);
    }

    sortwidth(a: Doc, b: Doc) {
        return (a.width - b.width);
    }

    sorttitle(a: Doc, b: Doc) {
        return a.title.localeCompare(b.title);
    }

    sortauthor(a: Doc, b: Doc) {
        return a.author.localeCompare(b.author);
    }

    sortzIndex(a: Doc, b: Doc) {
        return (a.zIndex - b.zIndex);
    }

    sortdate(a: Doc, b: Doc) {
        var adate: DateField = a.creationDate;
        var bdate: DateField = b.creationDate;
        return new Date(bdate.date) - new Date(adate.date);
    }



    get tableOptionsPanel() {
        const docs = DocListCast(this.props.Document[this.props.fieldKey]);

        let keys: { [key: string]: boolean } = {};
        untracked(() => docs.map(doc => Doc.GetAllPrototypes(doc).map(proto => Object.keys(proto).forEach(key => keys[key] = false))));

        return !this.props.active() ? (null) :
            (<Flyout
                anchorPoint={anchorPoints.RIGHT_TOP}
                content={<div>
                    <div id="schema-options-header"><h5><b>Options</b></h5></div>
                    <div id="options-flyout-div">
                        {Array.from(Object.keys(keys)).map(item =>
                            (<KeyToggle key={item} keyName={item} toggle={this.toggleKey} />))}

                    </div>
                </div>
                }>
                <button id="schemaOptionsMenuBtn" ><FontAwesomeIcon style={{ color: "white" }} icon="cog" size="sm" /></button>
            </Flyout>);
    }

    @action
    toggleKey = (key: string) => {
        this.sortstate = key;
        console.log(this.sortstate);
    }

    @observable
    private preview: Doc | undefined;

    @action
    show(document: Doc) {
        this.preview = document;
    }

    buttonloop() {
        let buttons = [];
        let buttons2 = [];
        let range = 1;
        let arr: Doc[] = [];
        let values: number[] = [];

        //Building the array is kinda weird because I reverse engineered something from another class.
        this.childDocs.filter(d => !d.isMinimized).map((d, i) => {
            arr.push(d);
        });
        if (this.sortstate === "creationDate") {
            arr.sort(this.sortdate);
            let i = arr.length - 1;
            range = arr[i].creationDate - arr[0].creationDate;
            for (let j = 0; j < arr.length; j++) {
                var newdate = arr[j].creationDate;
                values[j] = newdate;
            }

        }
        if (this.sortstate === "title") {
            arr.sort(this.sorttitle);
            range = arr.length;
            for (let j = 0; j < arr.length; j++) {
                values[j] = j;
            }
        }

        if (this.sortstate === "author") {
            arr.sort(this.sortauthor);
            range = arr.length;
            for (let j = 0; j < arr.length; j++) {
                values[j] = j;
            }
        }

        if (this.sortstate === "x") {
            arr.sort(this.sortx);
            let i = arr.length - 1;
            // while (arr[i] === undefined) {
            //     i += -1;
            //     if (i === 0) {
            //         break;
            //     }

            // }
            range = arr[i].x - arr[0].x;
            for (let j = 0; j < arr.length; j++) {
                if (arr[j].x === undefined) {
                    values[j] = 0;
                }
                else {
                    values[j] = arr[j].x;
                }
            }
        }

        if (this.sortstate === "y") {
            arr.sort(this.sorty);
            let i = arr.length - 1;
            range = arr[i].y - arr[0].y;
            for (let j = 0; j < arr.length; j++) {
                if (arr[j].y === undefined) {
                    values[j] = 0;
                }
                else {
                    values[j] = arr[j].y;
                }
            }
        }
        if (this.sortstate === "height") {
            arr.sort(this.sortheight);
            let i = arr.length - 1;
            range = arr[i].height - arr[0].height;
            for (let j = 0; j < arr.length; j++) {
                if (arr[j].height === undefined) {
                    values[j] = 0;
                }
                else {
                    values[j] = arr[j].height;
                }
            }
        }

        if (this.sortstate === "width") {
            arr.sort(this.sortwidth);
            let i = arr.length - 1;
            range = arr[i].width - arr[0].width;
            for (let j = 0; j < arr.length; j++) {
                if (arr[j].width === undefined) {
                    values[j] = 0;
                }
                else {
                    values[j] = arr[j].width;
                }
            }
        }

        if (this.sortstate === "zIndex") {
            arr.sort(this.sortzIndex);
            let i = arr.length - 1;
            range = arr[i].zIndex - arr[0].zIndex;
            for (let j = 0; j < arr.length; j++) {
                if (arr[j].zIndex === undefined) {
                    values[j] = 0;
                }
                else {
                    values[j] = arr[j].zIndex;
                }
            }
        }



        for (let i = 0; i < arr.length; i++) {
            let color = "$darker-color";
            if (i % 2 === 0) {
                color = "$intermediate-color";
                console.log("yeet");
            }

            buttons.push(
                <div>
                    <button onClick={() => this.show(arr[i])}
                        style={{
                            position: "absolute",
                            background: color,
                            top: "70%", height: "5%", left: ((values[i] - values[0]) * this.barwidth / range) * (this.barwidth / (this.xmovement2 - this.xmovement)) - (this.xmovement * this.barwidth / (this.xmovement2 - this.xmovement)) + "px",
                        }}>{arr[i].title}</button>
                </div>);
            buttons2.push(
                <div

                    style={{
                        position: "absolute",
                        background: "black",
                        zIndex: "1",
                        top: "50%", left: ((values[i] - values[0]) * this.barwidth / range) + "px", width: "0.5%", border: "2px solid"
                    }}>
                </div>);
        }


        return (<div id="screen">
            <div className="backdropdocview" style={{ top: "5%", left: "33%", right: "33%", bottom: "40%", position: "absolute" }}>
                {this.preview ? this.documentpreview(this.preview) : (null)}
            </div>
            <div>{buttons}</div>
            <div id="bar" className="backdropscroll" onPointerDown={this.onPointerDown4} style={{ top: "85%", width: "100%", bottom: "10%", border: "3px solid", position: "absolute" }}>
                {buttons2}
                <div className="v1" onPointerDown={this.onPointerDown} style={{ cursor: "ew-resize", position: "absolute", zIndex: "2", left: this.xmovement, height: "100%" }}>

                </div>
                <div className="v2" onPointerDown={this.onPointerDown2} style={{
                    cursor: "ew-resize",
                    position: "absolute", left: this.xmovement2
                    , height: "100%",
                    zIndex: "2"
                }}>
                </div>
                <div className="bar" onPointerDown={this.onPointerDown3} style={{ left: this.xmovement, width: this.xmovement2 - this.xmovement, height: "100%", position: "absolute" }}>
                </div>

            </div>
        </div >
        );

    }

    documentpreview(document: Doc) {
        let returnHundred = () => 100;
        return (<DocumentContentsView Document={document}
            addDocument={undefined}
            addDocTab={this.props.addDocTab}
            removeDocument={undefined}
            ScreenToLocalTransform={Transform.Identity}
            ContentScaling={returnOne}
            PanelWidth={returnHundred}
            PanelHeight={returnHundred}
            isTopMost={true}
            selectOnLoad={false}
            focus={emptyFunction}
            isSelected={this.props.isSelected}
            select={returnFalse}
            layoutKey={"layout"}
            ContainingCollectionView={this.props.ContainingCollectionView}
            parentActive={this.props.active}
            whenActiveChanged={this.props.whenActiveChanged}
            bringToFront={emptyFunction} />)
    }

    onPointerDown = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove);
        this.barwidth = document.getElementById('bar').clientWidth;
        e.stopPropagation();
        e.preventDefault();
    }

    onPointerDown2 = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove2);
        e.stopPropagation();
        e.preventDefault();
    }

    onPointerDown3 = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove3);
        console.log("yeet");
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown4 = (e: React.PointerEvent): void => {
        let temp = this.xmovement2 - this.xmovement;
        this.xmovement = e.pageX;
        this.xmovement2 = temp + this.xmovement;
        if (this.xmovement2 > this.barwidth) {
            this.xmovement = this.barwidth - (this.xmovement2 - this.xmovement);
            this.xmovement2 = this.barwidth;
        }
        e.stopPropagation();
        e.preventDefault();



    }

    private barwidth = 962;

    @observable
    private xmovement = 0;

    @observable
    private xmovement2 = this.barwidth;

    @action
    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this.xmovement += e.movementX;
        if (this.xmovement < 0) {
            this.xmovement = 0;
        }
        if (this.xmovement > this.xmovement2 - 1) {
            this.xmovement = this.xmovement2 - 1;
        }
        console.log(this.barwidth);
        document.addEventListener("pointerup", this.onPointerUp);

    }

    @action
    onPointerMove2 = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        console.log(this.xmovement2);
        this.xmovement2 += e.movementX;
        if (this.xmovement2 > this.barwidth) {
            this.xmovement2 = this.barwidth;
        }
        if (this.xmovement2 < this.xmovement + 1) {
            this.xmovement2 = this.xmovement + 1;
        }

        document.addEventListener("pointerup", this.onPointerUp);

    }

    @action
    onPointerMove3 = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        console.log(this.xmovement2);
        this.xmovement2 += e.movementX;
        this.xmovement += e.movementX;
        if (this.xmovement2 > this.barwidth) {
            this.xmovement2 = this.barwidth;
            this.xmovement -= e.movementX;
        }
        if (this.xmovement < 0) {
            this.xmovement = 0;
            this.xmovement2 -= e.movementX;
        }

        document.addEventListener("pointerup", this.onPointerUp);

    }

    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointermove", this.onPointerMove2);
        document.removeEventListener("pointermove", this.onPointerMove3);
    }

    render() {
        return (
            <div className="collectionTimelineView" style={{ height: "100%" }}
                onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <hr style={{ top: "70%", display: "block", width: "100%", border: "10", position: "absolute" }} />
                {this.tableOptionsPanel}

                {this.buttonloop()}
            </div>
        );
    }
}
