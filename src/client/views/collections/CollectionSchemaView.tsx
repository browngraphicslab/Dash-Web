import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCog, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, untracked } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
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

    componentWillReceiveProps() {
        Server.GetField(this.props.keyId, action((field: Opt<Field>) => {
            if (field instanceof Key) {
                this.key = field;
            }
        }));
    }

    render() {
        if (this.key) {
            return (<div key={this.key.Id}>
                <input type="checkbox" checked={this.props.checked} onChange={() => this.key && this.props.toggle(this.key)} />
                {this.key.Name}
            </div>);
        }
        return (null);
    }
}

@observer
export class CollectionSchemaView extends CollectionSubView {
    private _mainCont = React.createRef<HTMLDivElement>();
    private _startSplitPercent = 0;
    private DIVIDER_WIDTH = 4;

    @observable _columns: Array<Key> = [KeyStore.Title, KeyStore.Data, KeyStore.Author];
    @observable _contentScaling = 1; // used to transfer the dimensions of the content pane in the DOM to the ContentScaling prop of the DocumentView
    @observable _dividerX = 0;
    @observable _panelWidth = 0;
    @observable _panelHeight = 0;
    @observable _selectedIndex = 0;
    @observable _columnsPercentage = 0;
    @observable _keys: Key[] = [];

    @computed get splitPercentage() { return this.props.Document.GetNumber(KeyStore.SchemaSplitPercentage, 0); }


    renderCell = (rowProps: CellInfo) => {
        let props: FieldViewProps = {
            Document: rowProps.value[0],
            fieldKey: rowProps.value[1],
            isSelected: returnFalse,
            select: emptyFunction,
            isTopMost: false,
            selectOnLoad: false,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyDocFunction,
            active: returnFalse,
            onActiveChanged: emptyFunction,
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

    @computed
    get columns() {
        return this.props.Document.GetList<Key>(KeyStore.ColumnsKey, []);
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
        this._startSplitPercent = this.splitPercentage;
        if (this._startSplitPercent === this.splitPercentage) {
            this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, this.splitPercentage === 0 ? 33 : 0);
        }
    }

    @computed
    get findAllDocumentKeys(): { [id: string]: boolean } {
        const docs = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        let keys: { [id: string]: boolean } = {};
        if (this._optionsActivated > -1) {
            // bcz: ugh.  this is untracked since otherwise a large collection of documents will blast the server for all their fields.
            //  then as each document's fields come back, we update the documents _proxies.  Each time we do this, the whole schema will be
            //  invalidated and re-rendered.   This workaround will inquire all of the document fields before the options button is clicked.
            //  then by the time the options button is clicked, all of the fields should be in place.  If a new field is added while this menu
            //  is displayed (unlikely) it won't show up until something else changes.
            untracked(() => docs.map(doc => doc.GetAllPrototypes().map(proto => proto._proxies.forEach((val: any, key: string) => keys[key] = false))));
        }
        this.columns.forEach(key => keys[key.Id] = true);
        return keys;
    }

    @action
    onDividerMove = (e: PointerEvent): void => {
        let nativeWidth = this._mainCont.current!.getBoundingClientRect();
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

    @observable _tableWidth = 0;
    @action
    setTableDimensions = (r: any) => {
        this._tableWidth = r.entry.width;
    }
    @action
    setScaling = (r: any) => {
        const children = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        const selected = children.length > this._selectedIndex ? children[this._selectedIndex] : undefined;
        this._panelWidth = r.entry.width;
        this._panelHeight = r.entry.height ? r.entry.height : this._panelHeight;
        this._contentScaling = r.entry.width / selected!.GetNumber(KeyStore.NativeWidth, r.entry.width);
    }

    @computed
    get borderWidth() { return COLLECTION_BORDER_WIDTH; }
    getContentScaling = (): number => this._contentScaling;
    getPanelWidth = (): number => this._panelWidth;
    getPanelHeight = (): number => this._panelHeight;
    getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(- this.borderWidth - this.DIVIDER_WIDTH - this._dividerX, - this.borderWidth).scale(1 / this._contentScaling);
    getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform().translate(- this.borderWidth - this.DIVIDER_WIDTH - this._dividerX - this._tableWidth, - this.borderWidth).scale(1 / this._contentScaling);

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button === 1 && this.props.isSelected() && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.stopPropagation();
        }
    }

    @action
    addColumn = () => {
        this.columns.push(new Key(this.newKeyName));
        this.newKeyName = "";
    }

    @observable
    newKeyName: string = "";

    @action
    newKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.newKeyName = e.currentTarget.value;
    }
    onWheel = (e: React.WheelEvent): void => {
        if (this.props.active()) {
            e.stopPropagation();
        }
    }

    @observable _optionsActivated: number = 0;
    @action
    OptionsMenuDown = (e: React.PointerEvent) => {
        this._optionsActivated++;
    }

    @observable previewScript: string = "this";
    @action
    onPreviewScriptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.previewScript = e.currentTarget.value;
    }

    render() {
        library.add(faCog);
        library.add(faPlus);
        const columns = this.columns;
        const children = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        const selected = children.length > this._selectedIndex ? children[this._selectedIndex] : undefined;
        //all the keys/columns that will be displayed in the schema
        const allKeys = this.findAllDocumentKeys;
        let doc: any = selected ? selected.Get(new Key(this.previewScript)) : undefined;

        // let doc = CompileScript(this.previewScript, { this: selected }, true)();
        let content = this._selectedIndex === -1 || !selected ? (null) : (
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div className="collectionSchemaView-content" ref={measureRef}>
                        {doc instanceof Document ?
                            <DocumentView Document={doc}
                                addDocument={this.props.addDocument} removeDocument={this.props.removeDocument}
                                isTopMost={false}
                                selectOnLoad={false}
                                ScreenToLocalTransform={this.getPreviewTransform}
                                ContentScaling={this.getContentScaling}
                                PanelWidth={this.getPanelWidth}
                                PanelHeight={this.getPanelHeight}
                                ContainingCollectionView={undefined}
                                focus={emptyDocFunction}
                                parentActive={this.props.active}
                                onActiveChanged={this.props.onActiveChanged} /> : null}
                        <input value={this.previewScript} onChange={this.onPreviewScriptChange}
                            style={{ position: 'absolute', bottom: '0px' }} />
                    </div>
                }
            </Measure>
        );
        let dividerDragger = this.splitPercentage === 0 ? (null) :
            <div className="collectionSchemaView-dividerDragger" onPointerDown={this.onDividerDown} style={{ width: `${this.DIVIDER_WIDTH}px` }} />;

        //options button and menu
        let optionsMenu = !this.props.active() ? (null) : (<Flyout
            anchorPoint={anchorPoints.LEFT_TOP}
            content={<div>
                <div id="schema-options-header"><h5><b>Options</b></h5></div>
                <div id="options-flyout-div">
                    <h6 className="schema-options-subHeader">Preview Window</h6>
                    <div id="preview-schema-checkbox-div"><input type="checkbox" key={"Show Preview"} checked={this.splitPercentage !== 0} onChange={this.toggleExpander} />  Show Preview </div>
                    <h6 className="schema-options-subHeader" >Displayed Columns</h6>
                    <ul id="schema-col-checklist" >
                        {Array.from(Object.keys(allKeys)).map(item =>
                            (<KeyToggle checked={allKeys[item]} key={item} keyId={item} toggle={this.toggleKey} />))}
                    </ul>
                    <input value={this.newKeyName} onChange={this.newKeyChange} />
                    <button onClick={this.addColumn}><FontAwesomeIcon style={{ color: "white" }} icon="plus" size="lg" /></button>
                </div>
            </div>
            }>
            <button id="schemaOptionsMenuBtn" onPointerDown={this.OptionsMenuDown}><FontAwesomeIcon style={{ color: "white" }} icon="cog" size="sm" /></button>
        </Flyout>);

        return (
            <div className="collectionSchemaView-container" onPointerDown={this.onPointerDown} onWheel={this.onWheel} ref={this._mainCont}>
                <div className="collectionSchemaView-dropTarget" onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createDropTarget}>
                    <Measure onResize={this.setTableDimensions}>
                        {({ measureRef }) =>
                            <div className="collectionSchemaView-tableContainer" ref={measureRef} style={{ width: `calc(100% - ${this.splitPercentage}%)` }}>
                                <ReactTable
                                    data={children}
                                    pageSize={children.length}
                                    page={0}
                                    showPagination={false}
                                    columns={columns.map(col => ({
                                        Header: col.Name,
                                        accessor: (doc: Document) => [doc, col],
                                        id: col.Id
                                    }))}
                                    column={{
                                        ...ReactTableDefaults.column,
                                        Cell: this.renderCell,

                                    }}
                                    getTrProps={this.getTrProps}
                                />
                            </div>}
                    </Measure>
                    {dividerDragger}
                    <div className="collectionSchemaView-previewRegion" style={{ width: `calc(${this.props.Document.GetNumber(KeyStore.SchemaSplitPercentage, 0)}% - ${this.DIVIDER_WIDTH}px)` }}>
                        {content}
                    </div>
                    {optionsMenu}
                </div>
            </div >
        );
    }
}