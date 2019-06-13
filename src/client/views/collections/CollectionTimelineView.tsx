import React = require("react");
import { action, computed, IReactionDisposer, reaction, observable, untracked } from "mobx";
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
import { faFilePowerpoint } from "@fortawesome/free-solid-svg-icons";


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
    public sortstate: String = "date";

    @observable
    buttonloop() {
        let buttons = [];
        let range = 1;
        let arr: Doc[] = [];
        let values = [];
        //Building the array is kinda weird because I reverse engineered something from another class.
        this.childDocs.filter(d => !d.isMinimized).map((d, i) => {
            arr.push(d);
        });
        if (this.sortstate === "creationDate") {
            arr.sort(this.sortdate);
        }
        if (this.sortstate === "title") {
            arr.sort(this.sorttitle);
        }

        if (this.sortstate === "x") {
            arr.sort(this.sortx);
            let i = arr.length
            while (arr[i] === undefined) {
                i += -1;
                if (i === 0) {
                    break;
                }

            }
            range = arr[i].x - arr[0].x;
            console.log(range);
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
            let i = arr.length
            while (arr[i] === undefined) {
                i += -1;
                if (i === 0) {
                    break;
                }

            }
            range = arr[i].y - arr[0].y;
            console.log(range);
            for (let j = 0; j < arr.length; j++) {
                if (arr[j].x === undefined) {
                    values[j] = 0;
                }
                else {
                    values[j] = arr[j].y;
                }
            }
        }
        if (this.sortstate === "height") {
            arr.sort(this.sortheight);
        }



        var len = arr.length;

        let preview: String = "";
        let returnHundred = () => 100;
        let hover = false;


        for (let i = 0; i < arr.length; i++) {
            let color = "darker-color";
            if (i % 2 == 0) {
                color = "$intermediate-color";
            }

            let preview = <DocumentContentsView Document={arr[i]}
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
                bringToFront={emptyFunction} />
            buttons.push(
                <div>
                    <button onMouseOver={function flipp() { hover = true; }}
                        onMouseLeave={function flipp() { hover = false; }}
                        style={{
                            position: "absolute",
                            background: color,
                            top: "50%", left: ((values[i] - values[0]) * 100 / range) + "%", width: (5 / (2 * Math.log2((len / 10) + 1))) + "%"
                        }}>{arr[i].title}</button>


                </div>)
        }
        return buttons;
    }

    sortx(a: Doc, b: Doc) {
        return (a.x - b.x);
    }

    sorty(a: Doc, b: Doc) {
        return (a.y - b.y);
    }

    sortheight(a: Doc, b: Doc) {
        return (a.height - b.height);
    }

    sorttitle(a: Doc, b: Doc) {
        return a.title.localeCompare(b.title);
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
        console.log(this.sortstate);
    }


    @action
    show(hover: boolean, document: Doc) {
        console.log(document)
        let returnHundred = () => 100;
        if (hover) {
            return (
                <DocumentContentsView Document={document}
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
                    bringToFront={emptyFunction} />
            );
        }
    }


    // documentpreview(doc: Doc) {

    //     return <div style={{}}
    // }

    render() {
        return (
            <div className="collectionTimelineView" style={{ height: "100%" }}
                onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <hr style={{ top: "50%", display: "block", width: "100%", border: "10", position: "absolute" }} />
                {this.tableOptionsPanel}
                {this.documentpreview}
                {this.buttonloop()}


            </div>
        );
    }
}
