import React = require("react")
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCog } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import ReactTable, { CellInfo, ComponentPropsGetterR, ReactTableDefaults } from "react-table";
import "react-table/react-table.css";
import { Document } from "../../../fields/Document";
import { Field, Opt } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { Server } from "../../Server";
import { setupDrag } from "../../util/DragManager";
import { CompileScript, ToField } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import '../DocumentDecorations.scss';
import { EditableView } from "../EditableView";
import { DocumentView } from "../nodes/DocumentView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./CollectionSchemaView.scss";
import { CollectionView, COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { CollectionViewBase } from "./CollectionViewBase";


// bcz: need to add drag and drop of rows and columns.  This seems like it might work for rows: https://codesandbox.io/s/l94mn1q657


@observer
class KeyToggle extends React.Component<{ keyId: string, checked: boolean, toggle: (key: Key) => void }> {
    @observable key: Key | undefined;

    componentWillReceiveProps() {
        Server.GetField(this.props.keyId, action((field: Opt<Field>) => {
            if (field instanceof Key) {
                this.key = field;
            }
        }))
    }

    render() {
        if (this.key) {
            return (<div key={this.key.Id}>
                <input type="checkbox" checked={this.props.checked} onChange={() => this.key && this.props.toggle(this.key)} />
                {this.key.Name}
            </div>)
        }
        return (null);
    }
}

@observer
export class CollectionSchemaView extends CollectionViewBase {
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
            doc: rowProps.value[0],
            fieldKey: rowProps.value[1],
            isSelected: () => false,
            select: () => { },
            isTopMost: false,
            bindings: {},
            selectOnLoad: false,
        }
        let contents = (
            <FieldView {...props} />
        )
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = setupDrag(reference, () => props.doc, (containingCollection: CollectionView) => this.props.removeDocument(props.doc));
        return (
            <div className="collectionSchemaView-cellContents" onPointerDown={onItemDown} style={{ height: "36px" }} key={props.doc.Id} ref={reference}>
                <EditableView
                    display={"inline"}
                    contents={contents}
                    height={36} GetValue={() => {
                        let field = props.doc.Get(props.fieldKey);
                        if (field && field instanceof Field) {
                            return field.ToScriptString();
                        }
                        return field || "";
                    }}
                    SetValue={(value: string) => {
                        let script = CompileScript(value);
                        if (!script.compiled) {
                            return false;
                        }
                        let field = script();
                        if (field instanceof Field) {
                            props.doc.Set(props.fieldKey, field);
                            return true;
                        } else {
                            let dataField = ToField(field);
                            if (dataField) {
                                props.doc.Set(props.fieldKey, dataField);
                                return true;
                            }
                        }
                        return false;
                    }}>
                </EditableView>
            </div>
        )
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
                    handleOriginal()
                }
            }),
            style: {
                background: rowInfo.index == this._selectedIndex ? "lightGray" : "white",
                //color: rowInfo.index == this._selectedIndex ? "white" : "black"
            }
        };
    }

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

            })
    }

    //toggles preview side-panel of schema
    @action
    toggleExpander = (event: React.ChangeEvent<HTMLInputElement>) => {
        this._startSplitPercent = this.splitPercentage;
        if (this._startSplitPercent == this.splitPercentage) {
            this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, this.splitPercentage == 0 ? 33 : 0);
        }
    }
    findAllDocumentKeys = (): { [id: string]: boolean } => {
        const docs = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        let keys: { [id: string]: boolean } = {}
        docs.map(doc => doc.GetAllPrototypes().map(proto => proto._proxies.forEach((val: any, key: string) => keys[key] = false)));
        this.columns.forEach(key => keys[key.Id] = true)
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
        if (this._startSplitPercent == this.splitPercentage) {
            this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, this.splitPercentage == 0 ? 33 : 0);
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

    getContentScaling = (): number => this._contentScaling;
    getPanelWidth = (): number => this._panelWidth;
    getPanelHeight = (): number => this._panelHeight;
    getTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().translate(- COLLECTION_BORDER_WIDTH - this.DIVIDER_WIDTH - this._dividerX, - COLLECTION_BORDER_WIDTH).scale(1 / this._contentScaling);
    }
    getPreviewTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().translate(- COLLECTION_BORDER_WIDTH - this.DIVIDER_WIDTH - this._dividerX - this._tableWidth, - COLLECTION_BORDER_WIDTH).scale(1 / this._contentScaling);
    }

    focusDocument = (doc: Document) => { }

    onPointerDown = (e: React.PointerEvent): void => {
        if (this.props.isSelected()) {
            e.stopPropagation();
        }
    }

    render() {
        library.add(faCog);
        const columns = this.columns;
        const children = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        const selected = children.length > this._selectedIndex ? children[this._selectedIndex] : undefined;
        //all the keys/columns that will be displayed in the schema
        const allKeys = this.findAllDocumentKeys();
        let content = this._selectedIndex == -1 || !selected ? (null) : (
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div className="collectionSchemaView-content" ref={measureRef}>
                        <DocumentView Document={selected}
                            AddDocument={this.props.addDocument} RemoveDocument={this.props.removeDocument}
                            isTopMost={false}
                            SelectOnLoad={false}
                            ScreenToLocalTransform={this.getPreviewTransform}
                            ContentScaling={this.getContentScaling}
                            PanelWidth={this.getPanelWidth}
                            PanelHeight={this.getPanelHeight}
                            ContainingCollectionView={this.props.CollectionView}
                            focus={this.focusDocument}
                        />
                    </div>
                }
            </Measure>
        )
        let dividerDragger = this.splitPercentage == 0 ? (null) :
            <div className="collectionSchemaView-dividerDragger" onPointerDown={this.onDividerDown} style={{ width: `${this.DIVIDER_WIDTH}px` }} />

        //options button and menu
        let optionsMenu = !this.props.active() ? (null) : (<Flyout
            anchorPoint={anchorPoints.LEFT_TOP}
            content={<div>
                <div id="schema-options-header"><h5><b>Options</b></h5></div>
                <div id="options-flyout-div">
                    <h6 className="schema-options-subHeader">Preview Window</h6>
                    <div id="preview-schema-checkbox-div"><input type="checkbox" key={"Show Preview"} checked={this.splitPercentage != 0} onChange={this.toggleExpander} />  Show Preview </div>
                    <h6 className="schema-options-subHeader" >Displayed Columns</h6>
                    <ul id="schema-col-checklist" >
                        {Array.from(Object.keys(allKeys)).map(item => {
                            return (<KeyToggle checked={allKeys[item]} key={item} keyId={item} toggle={this.toggleKey} />)
                        })}
                    </ul>
                </div>
            </div>
            }>
            <button id="schemaOptionsMenuBtn"><FontAwesomeIcon style={{ color: "white" }} icon="cog" size="sm" /></button>
        </Flyout>);

        return (
            <div className="collectionSchemaView-container" onPointerDown={this.onPointerDown} ref={this._mainCont} style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }} >
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
        )
    }
}