import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCog, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, untracked } from "mobx";
import { observer } from "mobx-react";
import ReactTable, { CellInfo, ComponentPropsGetterR, ReactTableDefaults } from "react-table";
import "react-table/react-table.css";
import { Document } from "../../../fields/Document";
import { Field, Opt } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { emptyDocFunction, emptyFunction, returnFalse } from "../../../Utils";
import { Server } from "../../Server";
import { SetupDrag } from "../../util/DragManager";
import { CompileScript, ToField } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { COLLECTION_BORDER_WIDTH } from "../../views/globalCssVariables.scss";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import '../DocumentDecorations.scss';
import { EditableView } from "../EditableView";
import { DocumentView } from "../nodes/DocumentView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./CollectionSchemaView.scss";
import { CollectionSubView } from "./CollectionSubView";


// bcz: need to add drag and drop of rows and columns.  This seems like it might work for rows: https://codesandbox.io/s/l94mn1q657


@observer
class KeyToggle extends React.Component<{ keyId: string, checked: boolean, toggle: (key: Key) => void }> {
    @observable key: Key | undefined;

    constructor(props: any) {
        super(props);
        Server.GetField(this.props.keyId, action((field: Opt<Field>) => field instanceof Key && (this.key = field)));
    }

    render() {
        return !this.key ? (null) :
            (<div key={this.key.Id}>
                <input type="checkbox" checked={this.props.checked} onChange={() => this.key && this.props.toggle(this.key)} />
                {this.key.Name}
            </div>);
    }
}

@observer
export class CollectionSchemaView extends CollectionSubView {
    private _mainCont?: HTMLDivElement;
    private _startSplitPercent = 0;
    private DIVIDER_WIDTH = 4;

    @observable _columns: Array<Key> = [KeyStore.Title, KeyStore.Data, KeyStore.Author];
    @observable _selectedIndex = 0;
    @observable _columnsPercentage = 0;
    @observable _keys: Key[] = [];
    @observable _newKeyName: string = "";

    @computed get splitPercentage() { return this.props.Document.GetNumber(KeyStore.SchemaSplitPercentage, 0); }
    @computed get columns() { return this.props.Document.GetList(KeyStore.ColumnsKey, [] as Key[]); }
    @computed get borderWidth() { return COLLECTION_BORDER_WIDTH; }

    renderCell = (rowProps: CellInfo) => {
        let props: FieldViewProps = {
            Document: rowProps.value[0],
            fieldKey: rowProps.value[1],
            ContainingCollectionView: this.props.CollectionView,
            isSelected: returnFalse,
            select: emptyFunction,
            isTopMost: false,
            selectOnLoad: false,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyDocFunction,
            active: returnFalse,
            whenActiveChanged: emptyFunction,
        };
        let contents = (
            <FieldView {...props} />
        );
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = SetupDrag(reference, () => props.Document, this.props.moveDocument);
        let applyToDoc = (doc: Document, run: (args?: { [name: string]: any }) => any) => {
            const res = run({ this: doc });
            if (!res.success) return false;
            const field = res.result;
            if (field instanceof Field) {
                doc.Set(props.fieldKey, field);
                return true;
            } else {
                let dataField = ToField(field);
                if (dataField) {
                    doc.Set(props.fieldKey, dataField);
                    return true;
                }
            }
            return false;
        };
        return (
            <div className="collectionSchemaView-cellContents" onPointerDown={onItemDown} style={{ height: "56px" }} key={props.Document.Id} ref={reference}>
                <EditableView
                    display={"inline"}
                    contents={contents}
                    height={56}
                    GetValue={() => {
                        let field = props.Document.Get(props.fieldKey);
                        if (field && field instanceof Field) {
                            return field.ToScriptString();
                        }
                        return field || "";
                    }}
                    SetValue={(value: string) => {
                        let script = CompileScript(value, { addReturn: true, params: { this: Document.name } });
                        if (!script.compiled) {
                            return false;
                        }
                        return applyToDoc(props.Document, script.run);
                    }}
                    OnFillDown={(value: string) => {
                        let script = CompileScript(value, { addReturn: true, params: { this: Document.name } });
                        if (!script.compiled) {
                            return;
                        }
                        const run = script.run;
                        //TODO This should be able to be refactored to compile the script once
                        this.props.Document.GetTAsync<ListField<Document>>(this.props.fieldKey, ListField).then((val) => {
                            if (val) {
                                val.Data.forEach(doc => applyToDoc(doc, run));
                            }
                        });
                    }}>
                </EditableView>
            </div>
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
    toggleKey = (key: Key) => {
        this.props.Document.GetOrCreateAsync<ListField<Key>>(KeyStore.ColumnsKey, ListField,
            (field) => {
                const index = field.Data.indexOf(key);
                if (index === -1) {
                    this.columns.push(key);
                } else {
                    this.columns.splice(index, 1);
                }

            });
    }

    //toggles preview side-panel of schema
    @action
    toggleExpander = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, this.splitPercentage === 0 ? 33 : 0);
    }

    @action
    onDividerMove = (e: PointerEvent): void => {
        let nativeWidth = this._mainCont!.getBoundingClientRect();
        this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, Math.max(0, 100 - Math.round((e.clientX - nativeWidth.left) / nativeWidth.width * 100)));
    }
    @action
    onDividerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
        if (this._startSplitPercent === this.splitPercentage) {
            this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, this.splitPercentage === 0 ? 33 : 0);
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
            if (this.props.isSelected())
                e.stopPropagation();
            else e.preventDefault();
        }
    }

    onWheel = (e: React.WheelEvent): void => {
        if (this.props.active()) {
            e.stopPropagation();
        }
    }

    @action
    addColumn = () => {
        this.columns.push(new Key(this._newKeyName));
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

    get previewDocument(): Document | undefined {
        const children = this.props.Document.GetList(this.props.fieldKey, [] as Document[]);
        const selected = children.length > this._selectedIndex ? children[this._selectedIndex] : undefined;
        return selected ? (this.previewScript ? selected.Get(new Key(this.previewScript)) as Document : selected) : undefined;
    }
    get tableWidth() { return (this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH) * (1 - this.splitPercentage / 100); }
    get previewRegionHeight() { return this.props.PanelHeight() - 2 * this.borderWidth; }
    get previewRegionWidth() { return (this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH) * this.splitPercentage / 100; }

    private previewDocNativeWidth = () => this.previewDocument!.GetNumber(KeyStore.NativeWidth, this.previewRegionWidth);
    private previewDocNativeHeight = () => this.previewDocument!.GetNumber(KeyStore.NativeHeight, this.previewRegionHeight);
    private previewContentScaling = () => {
        let wscale = this.previewRegionWidth / (this.previewDocNativeWidth() ? this.previewDocNativeWidth() : this.previewRegionWidth);
        if (wscale * this.previewDocNativeHeight() > this.previewRegionHeight)
            return this.previewRegionHeight / (this.previewDocNativeHeight() ? this.previewDocNativeHeight() : this.previewRegionHeight);
        return wscale;
    }
    private previewPanelWidth = () => this.previewDocNativeWidth() * this.previewContentScaling();
    private previewPanelHeight = () => this.previewDocNativeHeight() * this.previewContentScaling();
    get previewPanelCenteringOffset() { return (this.previewRegionWidth - this.previewDocNativeWidth() * this.previewContentScaling()) / 2; }
    getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform().translate(
        - this.borderWidth - this.DIVIDER_WIDTH - this.tableWidth - this.previewPanelCenteringOffset,
        - this.borderWidth).scale(1 / this.previewContentScaling());

    @computed
    get previewPanel() {
        // let doc = CompileScript(this.previewScript, { this: selected }, true)();
        return !this.previewDocument ? (null) : (
            <div className="collectionSchemaView-previewRegion" style={{ width: `${this.previewRegionWidth}px` }}>
                <div className="collectionSchemaView-previewDoc" style={{ transform: `translate(${this.previewPanelCenteringOffset}px, 0px)` }}>
                    <DocumentView Document={this.previewDocument} isTopMost={false} selectOnLoad={false}
                        addDocument={this.props.addDocument} removeDocument={this.props.removeDocument}
                        ScreenToLocalTransform={this.getPreviewTransform}
                        ContentScaling={this.previewContentScaling}
                        PanelWidth={this.previewPanelWidth} PanelHeight={this.previewPanelHeight}
                        ContainingCollectionView={this.props.CollectionView}
                        focus={emptyDocFunction}
                        parentActive={this.props.active}
                        whenActiveChanged={this.props.whenActiveChanged}
                    />
                </div>
                <input className="collectionSchemaView-input" value={this.previewScript} onChange={this.onPreviewScriptChange}
                    style={{ left: `calc(50% - ${Math.min(75, this.previewPanelWidth() / 2)}px)` }} />
            </div>
        );
    }

    get documentKeysCheckList() {
        const docs = this.props.Document.GetList(this.props.fieldKey, [] as Document[]);
        let keys: { [id: string]: boolean } = {};
        // bcz: ugh.  this is untracked since otherwise a large collection of documents will blast the server for all their fields.
        //  then as each document's fields come back, we update the documents _proxies.  Each time we do this, the whole schema will be
        //  invalidated and re-rendered.   This workaround will inquire all of the document fields before the options button is clicked.
        //  then by the time the options button is clicked, all of the fields should be in place.  If a new field is added while this menu
        //  is displayed (unlikely) it won't show up until something else changes.
        untracked(() => docs.map(doc => doc.GetAllPrototypes().map(proto => proto._proxies.forEach((val: any, key: string) => keys[key] = false))));

        this.columns.forEach(key => keys[key.Id] = true);
        return Array.from(Object.keys(keys)).map(item =>
            (<KeyToggle checked={keys[item]} key={item} keyId={item} toggle={this.toggleKey} />));
    }

    get tableOptionsPanel() {
        return !this.props.active() ? (null) :
            (<Flyout
                anchorPoint={anchorPoints.LEFT_TOP}
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
        const children = this.props.Document.GetList(this.props.fieldKey, [] as Document[]);
        return (
            <div className="collectionSchemaView-container" onPointerDown={this.onPointerDown} onWheel={this.onWheel}
                onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createTarget}>
                <div className="collectionSchemaView-tableContainer" style={{ width: `${this.tableWidth}px` }}>
                    <ReactTable data={children} page={0} pageSize={children.length} showPagination={false}
                        columns={this.columns.map(col => ({
                            Header: col.Name,
                            accessor: (doc: Document) => [doc, col],
                            id: col.Id
                        }))}
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