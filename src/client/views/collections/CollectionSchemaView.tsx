import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCog, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, untracked, runInAction } from "mobx";
import { observer } from "mobx-react";
import ReactTable, { CellInfo, ComponentPropsGetterR, ReactTableDefaults } from "react-table";
import { MAX_ROW_HEIGHT } from '../../views/globalCssVariables.scss';
import "react-table/react-table.css";
import { emptyFunction, returnFalse, returnZero } from "../../../Utils";
import { SetupDrag } from "../../util/DragManager";
import { CompileScript } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { COLLECTION_BORDER_WIDTH } from "../../views/globalCssVariables.scss";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import '../DocumentDecorations.scss';
import { EditableView } from "../EditableView";
import { DocumentView } from "../nodes/DocumentView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./CollectionSchemaView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { Opt, Field, Doc, DocListCastAsync, DocListCast } from "../../../new_fields/Doc";
import { Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { listSpec } from "../../../new_fields/Schema";
import { List } from "../../../new_fields/List";
import { Id } from "../../../new_fields/FieldSymbols";
import { Gateway } from "../../northstar/manager/Gateway";
import { Docs } from "../../documents/Documents";
import { ContextMenu } from "../ContextMenu";


// bcz: need to add drag and drop of rows and columns.  This seems like it might work for rows: https://codesandbox.io/s/l94mn1q657


@observer
class KeyToggle extends React.Component<{ keyName: string, checked: boolean, toggle: (key: string) => void }> {
    constructor(props: any) {
        super(props);
    }

    render() {
        return (
            <div key={this.props.keyName}>
                <input type="checkbox" checked={this.props.checked} onChange={() => this.props.toggle(this.props.keyName)} />
                {this.props.keyName}
            </div>
        );
    }
}

@observer
export class CollectionSchemaView extends CollectionSubView(doc => doc) {
    private _mainCont?: HTMLDivElement;
    private _startSplitPercent = 0;
    private DIVIDER_WIDTH = 4;

    @observable _columns: Array<string> = ["title", "data", "author"];
    @observable _selectedIndex = 0;
    @observable _columnsPercentage = 0;
    @observable _keys: string[] = [];
    @observable _newKeyName: string = "";

    @computed get splitPercentage() { return NumCast(this.props.Document.schemaSplitPercentage); }
    @computed get columns() { return Cast(this.props.Document.schemaColumns, listSpec("string"), []); }
    @computed get borderWidth() { return Number(COLLECTION_BORDER_WIDTH); }

    @computed get tableColumns() {
        return this.columns.map(col => {
            const ref = React.createRef<HTMLParagraphElement>();
            return {
                Header: <p ref={ref} onPointerDown={SetupDrag(ref, () => this.onHeaderDrag(col), undefined, "copy")}>{col}</p>,
                accessor: (doc: Doc) => doc ? doc[col] : 0,
                id: col
            };
        });
    }

    onHeaderDrag = (columnName: string) => {
        let schemaDoc = Cast(this.props.Document.schemaDoc, Doc);
        if (schemaDoc instanceof Doc) {
            let columnDocs = DocListCast(schemaDoc.data);
            if (columnDocs) {
                let ddoc = columnDocs.find(doc => doc.title === columnName);
                if (ddoc)
                    return ddoc;
            }
        }
        return this.props.Document;
    }

    renderCell = (rowProps: CellInfo) => {
        let props: FieldViewProps = {
            Document: rowProps.original,
            fieldKey: rowProps.column.id as string,
            ContainingCollectionView: this.props.CollectionView,
            isSelected: returnFalse,
            select: emptyFunction,
            isTopMost: false,
            selectOnLoad: false,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyFunction,
            active: returnFalse,
            whenActiveChanged: emptyFunction,
            PanelHeight: returnZero,
            PanelWidth: returnZero,
            addDocTab: this.props.addDocTab,
        };
        let fieldContentView = <FieldView {...props} />;
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = (e: React.PointerEvent) =>
            (this.props.CollectionView.props.isSelected() ?
                SetupDrag(reference, () => props.Document, this.props.moveDocument, this.props.Document.schemaDoc ? "copy" : undefined)(e) : undefined);
        let applyToDoc = (doc: Doc, run: (args?: { [name: string]: any }) => any) => {
            const res = run({ this: doc });
            if (!res.success) return false;
            doc[props.fieldKey] = res.result;
            return true;
        };
        return (
            <div className="collectionSchemaView-cellContents" onPointerDown={onItemDown} key={props.Document[Id]} ref={reference}>
                <EditableView
                    display={"inline"}
                    contents={fieldContentView}
                    height={Number(MAX_ROW_HEIGHT)}
                    GetValue={() => {
                        let field = props.Document[props.fieldKey];
                        if (Field.IsField(field)) {
                            return Field.toScriptString(field);
                        }
                        return "";
                    }}
                    SetValue={(value: string) => {
                        let script = CompileScript(value, { addReturn: true, params: { this: Doc.name } });
                        if (!script.compiled) {
                            return false;
                        }
                        return applyToDoc(props.Document, script.run);
                    }}
                    OnFillDown={async (value: string) => {
                        let script = CompileScript(value, { addReturn: true, params: { this: Doc.name } });
                        if (!script.compiled) {
                            return;
                        }
                        const run = script.run;
                        //TODO This should be able to be refactored to compile the script once
                        const val = await DocListCastAsync(this.props.Document[this.props.fieldKey]);
                        val && val.forEach(doc => applyToDoc(doc, run));
                    }}>
                </EditableView>
            </div >
        );
    }

    private getTrProps: ComponentPropsGetterR = (state, rowInfo) => {
        const that = this;
        if (!rowInfo) {
            return {};
        }
        return {
            onClick: action((e: React.MouseEvent, handleOriginal: Function) => {
                that.props.select(e.ctrlKey);
                that._selectedIndex = rowInfo.index;

                if (handleOriginal) {
                    handleOriginal();
                }
            }),
            style: {
                background: rowInfo.index === this._selectedIndex ? "lightGray" : "white",
                //color: rowInfo.index === this._selectedIndex ? "white" : "black"
            }
        };
    }

    private createTarget = (ele: HTMLDivElement) => {
        this._mainCont = ele;
        super.CreateDropTarget(ele);
    }

    @action
    toggleKey = (key: string) => {
        let list = Cast(this.props.Document.schemaColumns, listSpec("string"));
        if (list === undefined) {
            this.props.Document.schemaColumns = list = new List<string>([key]);
        } else {
            const index = list.indexOf(key);
            if (index === -1) {
                list.push(key);
            } else {
                list.splice(index, 1);
            }
        }
    }

    //toggles preview side-panel of schema
    @action
    toggleExpander = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.Document.schemaSplitPercentage = this.splitPercentage === 0 ? 33 : 0;
    }

    @action
    onDividerMove = (e: PointerEvent): void => {
        let nativeWidth = this._mainCont!.getBoundingClientRect();
        this.props.Document.schemaSplitPercentage = Math.max(0, 100 - Math.round((e.clientX - nativeWidth.left) / nativeWidth.width * 100));
    }
    @action
    onDividerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
        if (this._startSplitPercent === this.splitPercentage) {
            this.props.Document.schemaSplitPercentage = this.splitPercentage === 0 ? 33 : 0;
        }
    }
    onDividerDown = (e: React.PointerEvent) => {
        this._startSplitPercent = this.splitPercentage;
        e.stopPropagation();
        e.preventDefault();
        document.addEventListener("pointermove", this.onDividerMove);
        document.addEventListener('pointerup', this.onDividerUp);
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (this.props.isSelected()) e.stopPropagation();
            else e.preventDefault();
        }
    }

    onWheel = (e: React.WheelEvent): void => {
        if (this.props.active()) {
            e.stopPropagation();
        }
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Make DB", event: this.makeDB });
        }
    }

    @action
    makeDB = async () => {
        let csv: string = this.columns.reduce((val, col) => val + col + ",", "");
        csv = csv.substr(0, csv.length - 1) + "\n";
        let self = this;
        DocListCast(this.props.Document.data).map(doc => {
            csv += self.columns.reduce((val, col) => val + (doc[col] ? doc[col]!.toString() : "0") + ",", "");
            csv = csv.substr(0, csv.length - 1) + "\n";
        });
        csv.substring(0, csv.length - 1);
        let dbName = StrCast(this.props.Document.title);
        let res = await Gateway.Instance.PostSchema(csv, dbName);
        if (self.props.CollectionView.props.addDocument) {
            let schemaDoc = await Docs.DBDocument("https://www.cs.brown.edu/" + dbName, { title: dbName }, { dbDoc: self.props.Document });
            if (schemaDoc) {
                //self.props.CollectionView.props.addDocument(schemaDoc, false);
                self.props.Document.schemaDoc = schemaDoc;
            }
        }
    }

    @action
    addColumn = () => {
        this.columns.push(this._newKeyName);
        this._newKeyName = "";
    }

    @action
    newKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._newKeyName = e.currentTarget.value;
    }

    @observable previewScript: string = "";
    @action
    onPreviewScriptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.previewScript = e.currentTarget.value;
    }

    @computed
    get previewDocument(): Doc | undefined {
        const children = DocListCast(this.props.Document[this.props.fieldKey]);
        const selected = children.length > this._selectedIndex ? FieldValue(children[this._selectedIndex]) : undefined;
        return selected ? (this.previewScript && this.previewScript !== "this" ? FieldValue(Cast(selected[this.previewScript], Doc)) : selected) : undefined;
    }
    get tableWidth() { return (this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH) * (1 - this.splitPercentage / 100); }
    get previewRegionHeight() { return this.props.PanelHeight() - 2 * this.borderWidth; }
    get previewRegionWidth() { return (this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH) * this.splitPercentage / 100; }

    private previewDocNativeWidth = () => Cast(this.previewDocument!.nativeWidth, "number", this.previewRegionWidth);
    private previewDocNativeHeight = () => Cast(this.previewDocument!.nativeHeight, "number", this.previewRegionHeight);
    private previewContentScaling = () => {
        let wscale = this.previewRegionWidth / (this.previewDocNativeWidth() ? this.previewDocNativeWidth() : this.previewRegionWidth);
        if (wscale * this.previewDocNativeHeight() > this.previewRegionHeight) {
            return this.previewRegionHeight / (this.previewDocNativeHeight() ? this.previewDocNativeHeight() : this.previewRegionHeight);
        }
        return wscale;
    }
    private previewPanelWidth = () => this.previewDocNativeWidth() * this.previewContentScaling();
    private previewPanelHeight = () => this.previewDocNativeHeight() * this.previewContentScaling();
    get previewPanelCenteringOffset() { return (this.previewRegionWidth - this.previewDocNativeWidth() * this.previewContentScaling()) / 2; }
    getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform().translate(
        - this.borderWidth - this.DIVIDER_WIDTH - this.tableWidth - this.previewPanelCenteringOffset,
        - this.borderWidth).scale(1 / this.previewContentScaling())

    @computed
    get previewPanel() {
        // let doc = CompileScript(this.previewScript, { this: selected }, true)();
        const previewDoc = this.previewDocument;
        return (<div className="collectionSchemaView-previewRegion" style={{ width: `${Math.max(0, this.previewRegionWidth - 1)}px` }}>
            {!previewDoc || !this.previewRegionWidth ? (null) : (
                <div className="collectionSchemaView-previewDoc" style={{ transform: `translate(${this.previewPanelCenteringOffset}px, 0px)` }}>
                    <DocumentView Document={previewDoc} isTopMost={false} selectOnLoad={false}
                        toggleMinimized={emptyFunction}
                        addDocument={this.props.addDocument} removeDocument={this.props.removeDocument}
                        ScreenToLocalTransform={this.getPreviewTransform}
                        ContentScaling={this.previewContentScaling}
                        PanelWidth={this.previewPanelWidth} PanelHeight={this.previewPanelHeight}
                        ContainingCollectionView={this.props.CollectionView}
                        focus={emptyFunction}
                        parentActive={this.props.active}
                        whenActiveChanged={this.props.whenActiveChanged}
                        bringToFront={emptyFunction}
                        addDocTab={this.props.addDocTab}
                    />
                </div>)}
            <input className="collectionSchemaView-input" value={this.previewScript} onChange={this.onPreviewScriptChange}
                style={{ left: `calc(50% - ${Math.min(75, (previewDoc ? this.previewPanelWidth() / 2 : 75))}px)` }} />
        </div>);
    }

    get documentKeysCheckList() {
        const docs = DocListCast(this.props.Document[this.props.fieldKey]);
        let keys: { [key: string]: boolean } = {};
        // bcz: ugh.  this is untracked since otherwise a large collection of documents will blast the server for all their fields.
        //  then as each document's fields come back, we update the documents _proxies.  Each time we do this, the whole schema will be
        //  invalidated and re-rendered.   This workaround will inquire all of the document fields before the options button is clicked.
        //  then by the time the options button is clicked, all of the fields should be in place.  If a new field is added while this menu
        //  is displayed (unlikely) it won't show up until something else changes.
        //TODO Types
        untracked(() => docs.map(doc => Doc.GetAllPrototypes(doc).map(proto => Object.keys(proto).forEach(key => keys[key] = false))));

        this.columns.forEach(key => keys[key] = true);
        return Array.from(Object.keys(keys)).map(item =>
            (<KeyToggle checked={keys[item]} key={item} keyName={item} toggle={this.toggleKey} />));
    }

    get tableOptionsPanel() {
        return !this.props.active() ? (null) :
            (<Flyout
                anchorPoint={anchorPoints.RIGHT_TOP}
                content={<div>
                    <div id="schema-options-header"><h5><b>Options</b></h5></div>
                    <div id="options-flyout-div">
                        <h6 className="schema-options-subHeader">Preview Window</h6>
                        <div id="preview-schema-checkbox-div"><input type="checkbox" key={"Show Preview"} checked={this.splitPercentage !== 0} onChange={this.toggleExpander} />  Show Preview </div>
                        <h6 className="schema-options-subHeader" >Displayed Columns</h6>
                        <ul id="schema-col-checklist" >
                            {this.documentKeysCheckList}
                        </ul>
                        <input value={this._newKeyName} onChange={this.newKeyChange} />
                        <button onClick={this.addColumn}><FontAwesomeIcon style={{ color: "white" }} icon="plus" size="lg" /></button>
                    </div>
                </div>
                }>
                <button id="schemaOptionsMenuBtn" ><FontAwesomeIcon style={{ color: "white" }} icon="cog" size="sm" /></button>
            </Flyout>);
    }

    @computed
    get dividerDragger() {
        return this.splitPercentage === 0 ? (null) :
            <div className="collectionSchemaView-dividerDragger" onPointerDown={this.onDividerDown} style={{ width: `${this.DIVIDER_WIDTH}px` }} />;
    }



    render() {
        library.add(faCog);
        library.add(faPlus);
        const children = this.childDocs;
        return (
            <div className="collectionSchemaView-container" onPointerDown={this.onPointerDown} onWheel={this.onWheel}
                onDrop={(e: React.DragEvent) => this.onDrop(e, {})} onContextMenu={this.onContextMenu} ref={this.createTarget}>
                <div className="collectionSchemaView-tableContainer" style={{ width: `${this.tableWidth}px` }}>
                    <ReactTable data={children} page={0} pageSize={children.length} showPagination={false}
                        columns={this.tableColumns}
                        column={{ ...ReactTableDefaults.column, Cell: this.renderCell, }}
                        getTrProps={this.getTrProps}
                    />
                </div>
                {this.dividerDragger}
                {this.previewPanel}
                {this.tableOptionsPanel}
            </div>
        );
    }
}