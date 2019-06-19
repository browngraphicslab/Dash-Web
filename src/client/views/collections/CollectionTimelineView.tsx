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
import { faFilePowerpoint, faShower, faVideo, faThumbsDown, faPlus } from "@fortawesome/free-solid-svg-icons";
import { throwStatement, thisTypeAnnotation } from "babel-types";
import { faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faPenNib, faRedoAlt, faTable, faTree, faUndoAlt, faBell } from '@fortawesome/free-solid-svg-icons';
import { RichTextField } from "../../../new_fields/RichTextField";
import { ImageField, VideoField, AudioField, URLField, PdfField, WebField } from "../../../new_fields/URLField";
import { IconField } from "../../../new_fields/IconField";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Docs } from "../../documents/Documents";
import { HtmlField } from "../../../new_fields/HtmlField";
import { ProxyField } from "../../../new_fields/Proxy";
import { auto } from "async";
import Measure from "react-measure";




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

    @observable
    private sortstate: string = "date";

    private range = 0;




    sortdate(a: Doc, b: Doc) {
        var adate: DateField = a.creationDate;
        var bdate: DateField = b.creationDate;
        return new Date(adate.date) - new Date(bdate.date);
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
        this.preview5 = -2;
    }

    @observable
    private preview: Doc | undefined;

    @observable
    private preview2: Doc | undefined;

    @observable
    private preview3: string;
    @observable
    private preview4: string;
    @observable
    private preview5: String | number | Date;
    @observable
    private preview6: number = -2;


    @action
    show(document: Doc) {
        this.preview = document;
        this.preview2 = Docs.KVPDocument(document, {});
        this.preview3 = document.title + "";
        if (this.sortstate === "creationDate") {
            this.preview4 = this.sortstate + ":" + document.creationDate.date;
        }
        else {
            this.preview4 = this.sortstate + ":" + document[this.sortstate];
        }
    }

    overlapFlyOut(values: { doc: Doc, value: String | number | Date }[], checkvalue: (String | number | Date), leftval: string) {
        let overlaps = [];
        let filtered = values.filter(function (keyvalue) {
            if (keyvalue.value === checkvalue) {
                return keyvalue;
            }
        });

        for (let i = 0; i < filtered.length; i++) {
            overlaps.push(
                <div><button className="toolbar-button round-button" title="Notifs"
                    onClick={() => this.show(values[i].doc)}
                    style={{
                        position: "absolute",
                        background: "$dark-color",
                    }}>
                    <FontAwesomeIcon icon={faBell} size="sm" />

                </button>
                </div>);
        }
        console.log(overlaps);
        return (<div>
            {overlaps}
        </div>
        );
    }

    @action
    updateleft(num: number, value: String | number | Date) {
        if (this.preview6 === num) {
            this.preview6 = -2;
        }
        else {
            this.preview6 = num;

        }
        this.preview5 = value;
        console.log(num);
    }


    buttonloop() {
        let buttons = [];
        let buttons2 = [];
        this.range = 1;
        let arr: Doc[] = [];

        this.childDocs.filter(d => !d.isMinimized).map((d, i) => {
            arr.push(d);
        });

        let backup = arr.filter(doc => doc[this.sortstate]);
        let keyvalue: { doc: Doc, value: String | number | Date }[] = [];

        if (backup.length > 0) {
            if (this.sortstate === "creationDate") {
                keyvalue = backup.map(d => {
                    let vdate: DateField = d.creationDate;
                    let value = new Date(vdate.date);
                    return { doc: d, value: value };
                });
            }

            else if (isNaN(parseFloat(String(backup[0][this.sortstate])))) {
                keyvalue = backup.map(d => {
                    let value = String(d[this.sortstate]);
                    return { doc: d, value: value };
                });
            }
            else {
                keyvalue = backup.map(d => {
                    let value = NumCast(d[this.sortstate]);
                    return { doc: d, value: value };
                });
            }
        }
        keyvalue.sort(function (a, b) { return (a.value - b.value); });

        let docs = keyvalue.map(kv => kv.doc);
        let values = keyvalue.map(kv => kv.value);

        console.log(values);
        let i = values.length - 1;
        this.range = (values[i] - values[0]);
        console.log(this.range);
        if (this.range === 0) {
            this.range = values.length;
        }
        if (isNaN(this.range)) {
            this.range = values.length;
            for (let i = 0; i < values.length; i++) {
                values[i] = String(i);
            }
        }
        console.log(this.range);



        for (let i = 0; i < backup.length; i++) {
            let color = "$dark-color";
            let icon = this.checkData(backup[i]);
            let display = () => this.show(keyvalue[i].doc);
            let leftval = (((values[i] - values[0]) * this.barwidth / this.range) * (this.barwidth / (this.xmovement2 - this.xmovement)) - (this.xmovement * (this.barwidth - (10 / this.barwidth)) / (this.xmovement2 - this.xmovement))) * 0.97 + "px";
            for (let j = 0; j < backup.length; j++) {
                if (j !== i) {
                    if (values[i] === values[j]) {
                        icon = faPlus;
                        display = () => this.updateleft(i, values[i]);
                    }
                }
            }
            buttons.push(
                <div><button className="toolbar-button round-button" title="Notifs"
                    onClick={display} style={{
                        position: "absolute",
                        background: color,
                        top: "70%", height: "5%", left: leftval,
                    }}>

                    <FontAwesomeIcon icon={icon} size="sm" />

                </button>
                </div>);
            buttons2.push(
                <div
                    style={{
                        position: "absolute",
                        background: "black",
                        zIndex: "1",
                        top: "50%", left: ((values[i] - values[0]) * this.barwidth / this.range) * 0.97 + "px", width: "5px", border: "3px solid"
                    }}>
                </div>);
        }


        let overlaps = [];
        let checkvalue = this.preview5;
        let filtered = keyvalue.filter(function (keyvalue) {
            if (keyvalue.value === checkvalue) {
                return keyvalue;
            }
        });

        for (let i = 0; i < filtered.length; i++) {
            overlaps.push(
                <div><button className="toolbar-button round-button" title="Notifs"
                    onClick={() => this.show(filtered[i].doc)}
                    style={{

                        background: "$dark-color",
                    }}>
                    <FontAwesomeIcon icon={this.checkData(filtered[i].doc)} size="sm" />

                </button>
                </div>);
        }
        console.log(overlaps);

        return (<div id="screen" >
            <div className="backdropdocview" style={{ top: "5%", left: "10%", right: "50%", bottom: "40%", position: "absolute", borderBottom: "2px solid" }}>
                {this.preview ? this.documentpreview(this.preview) : (null)}
            </div>
            <div className="backdropdocview" style={{ top: "5%", left: "50%", right: "10%", bottom: "40%", position: "absolute", borderBottom: "2px solid" }}>
                {this.preview2 ? this.documentpreview(this.preview2) : (null)}
            </div>
            <div style={{ top: "62%", left: "25%", position: "absolute" }}>
                {this.preview3}
            </div>
            <div style={{ top: "62%", left: "75%", position: "absolute" }}>
                {this.preview4}
            </div>
            <div style={{ borderRadius: "15px 5px 5px 15px", top: "65%", left: (this.preview6 !== -2 ? (((values[this.preview6] - values[0]) * this.barwidth / this.range) * (this.barwidth / (this.xmovement2 - this.xmovement)) - (this.xmovement * this.barwidth / (this.xmovement2 - this.xmovement)) === this.barwidth ? (((values[this.preview6] - values[0]) * this.barwidth / this.range) * (this.barwidth / (this.xmovement2 - this.xmovement)) - (this.xmovement * this.barwidth / (this.xmovement2 - this.xmovement)) - this.barwidth / 40) : (((values[this.preview6] - values[0]) * this.barwidth / this.range) * (this.barwidth / (this.xmovement2 - this.xmovement)) - (this.xmovement * this.barwidth / (this.xmovement2 - this.xmovement)))) + 35 + "px" : "-9999px"), position: "absolute", overflow: "auto", background: "grey", height: "100px", wFidth: "50px" }}>
                {overlaps}
            </div>
            <div className="viewpanel" style={{ top: "5%", position: "absolute", right: "10%", bottom: "35%", background: "#GGGGGG", zIndex: "-55", }}></div>
            <div>{buttons}</div>
            <div id="bar" className="backdropscroll" onPointerDown={this.onPointerDown4} style={{ top: "85%", width: "100%", bottom: "10%", position: "absolute", }}>
                {buttons2}
                <div className="v1" onPointerDown={this.onPointerDown} style={{ cursor: "ew-resize", position: "absolute", zIndex: "2", left: this.xmovement, height: "100%" }}>

                </div>
                <div className="v2" onPointerDown={this.onPointerDown2} style={{
                    cursor: "ew-resize",
                    position: "absolute", left: this.xmovement2,
                    height: "100%",
                    zIndex: "2"
                }}>
                </div>
                <div className="bar" onPointerDown={this.onPointerDown3} style={{ left: this.xmovement, width: this.xmovement2 - this.xmovement, height: "100%", position: "absolute" }}>
                </div>
                <Measure onResize={() => this.updateWidth()}>
                    {({ measureRef }) => <div ref={measureRef}> </div>}
                </Measure>


            </div>
        </div >
        );

    }

    checkData = (document: Doc): IconProp => {
        let field = document.data;
        if (field instanceof AudioField) {
            return faMusic;
        }
        else if (field instanceof PdfField) {
            return faFilePdf;
        }
        else if (field instanceof RichTextField) {
            return faFont;
        }
        else if (field instanceof ImageField) {
            return faImage;
        }
        else if (field instanceof VideoField) {
            return faFilm;
        }
        else if (field instanceof WebField) {
            return faGlobeAsia;
        }
        else if (field instanceof ProxyField) {
            return faObjectGroup;
        }
        return faBell;
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

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        console.log(this.barwidth);
        document.addEventListener("pointermove", this.onPointerMove);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown2 = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove2);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown3 = (e: React.PointerEvent): void => {
        document.body.style.cursor = "grabbing";

        document.addEventListener("pointermove", this.onPointerMove3);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown4 = (e: React.PointerEvent): void => {

        let temp = this.xmovement2 - this.xmovement;
        this.xmovement = e.pageX - document.body.clientWidth + document.getElementById('screen').clientWidth;

        this.xmovement2 = temp + this.xmovement;
        if (this.xmovement2 > this.barwidth) {
            this.xmovement = this.barwidth - (this.xmovement2 - this.xmovement);
            this.xmovement2 = this.barwidth;
        }
        e.stopPropagation();
        e.preventDefault();



    }

    @action
    updateWidth() {
        this.barwidth = (document.getElementById('bar') ? document.getElementById('bar').clientWidth : (952));
    }

    @observable
    private barwidth = (document.getElementById('bar') ? document.getElementById('bar').clientWidth : (952));


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
        if (this.xmovement > this.xmovement2 - 3) {
            this.xmovement = this.xmovement2 - 3;
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
        if (this.xmovement2 > this.barwidth - 6) {
            this.xmovement2 = this.barwidth - 6;
        }
        if (this.xmovement2 < this.xmovement + 3) {
            this.xmovement2 = this.xmovement + 3;
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


        if (this.xmovement2 > this.barwidth - 6) {
            this.xmovement2 = this.barwidth - 6;
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
        document.body.style.cursor = "default";
    }

    render() {
        this.updateWidth();
        return (
            <div className="collectionTimelineView" id="poop" style={{ marginLeft: "1%", width: "98%", height: "100%" }}
                onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <hr style={{ top: "70%", display: "block", width: "100%", border: "10", position: "absolute" }} />
                {this.buttonloop()}
                {this.tableOptionsPanel}
            </div>
        );
    }
}
