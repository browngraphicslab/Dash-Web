<<<<<<< HEAD
import React = require("react");
import { action, observable } from "mobx";
=======
import React = require("react")
import { action, observable, ObservableMap, computed } from "mobx";
>>>>>>> f70ad315167b714f11f7d68f35a46abe9e525a4d
import { observer } from "mobx-react";
import Measure from "react-measure";
import ReactTable, { CellInfo, ComponentPropsGetterR, ReactTableDefaults } from "react-table";
import "react-table/react-table.css";
import { Document } from "../../../fields/Document";
import { Field, Opt } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { CompileScript, ToField } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { ContextMenu } from "../ContextMenu";
import { EditableView } from "../EditableView";
import { DocumentView } from "../nodes/DocumentView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./CollectionSchemaView.scss";
import { COLLECTION_BORDER_WIDTH, CollectionView } from "./CollectionView";
import { CollectionViewBase } from "./CollectionViewBase";
import { setupDrag } from "../../util/DragManager";
<<<<<<< HEAD
import '../DocumentDecorations.scss';
import { Flyout, anchorPoints } from "../DocumentDecorations";
import { DropdownButton, Dropdown } from 'react-bootstrap';
import { ListField } from "../../../fields/ListField";
import { Key } from "../../../fields/Key";
//import { Server } from "http";
//import { Server } from "http";
import { Server } from "../../Server";

//import { MenuItem } from 'react-bootstrap';
=======
import { Key } from "./../../../fields/Key";
import { Server } from "../../Server";
import { ListField } from "../../../fields/ListField";

>>>>>>> f70ad315167b714f11f7d68f35a46abe9e525a4d

// bcz: need to add drag and drop of rows and columns.  This seems like it might work for rows: https://codesandbox.io/s/l94mn1q657


@observer
class KeyToggle extends React.Component<{ keyId: string, checked: boolean, toggle: (key: Key) => void }> {
    @observable
    key: Key | undefined;

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
                <input type="checkbox" checked={this.props.checked} onChange={() => this.key && this.props.toggle(this.key)} />{this.key.Name}
            </div>)
        } else {
            return <div></div>
        }
    }
}

@observer
export class CollectionSchemaView extends CollectionViewBase {
    private _mainCont = React.createRef<HTMLDivElement>();
    private DIVIDER_WIDTH = 4;

    @observable _columns: Array<Key> = [KeyStore.Title, KeyStore.Data, KeyStore.Author];
    @observable _contentScaling = 1; // used to transfer the dimensions of the content pane in the DOM to the ContentScaling prop of the DocumentView
    @observable _dividerX = 0;
    @observable _panelWidth = 0;
    @observable _panelHeight = 0;
    @observable _selectedIndex = 0;
    @observable _columnsPercentage = 0;
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
                that._selectedIndex = rowInfo.index;
                // bcz - ugh - needed to force Measure to do its thing and call onResize
                this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, this.splitPercentage - 0.05)

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

    @observable keys: Key[] = [];

    findAllDocumentKeys = (): { [id: string]: boolean } => {
        const docs = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        let keys: { [id: string]: boolean } = {}
        docs.forEach(doc => {
            let protos = doc.GetAllPrototypes();
            for (const proto of protos) {
                proto._proxies.forEach((val: any, key: string) => {
                    keys[key] = false
                })
            }
        })
        this.columns.forEach(key => {
            keys[key.Id] = true;
        })
        return keys;
    }

    _startSplitPercent = 0;
    @action
    onDividerMove = (e: PointerEvent): void => {
        let nativeWidth = this._mainCont.current!.getBoundingClientRect();
        this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, 100 - Math.round((e.clientX - nativeWidth.left) / nativeWidth.width * 100));
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


    @action
    onColDividerMove = (e: PointerEvent): void => {
        let nativeWidth = this._mainCont.current!.getBoundingClientRect();
        this._columnsPercentage = 100 - (e.clientY - nativeWidth.top) / nativeWidth.height * 100;
    }
    @action
    onColDividerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onColDividerMove);
        document.removeEventListener('pointerup', this.onColDividerUp);
    }
    onColDividerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        document.addEventListener("pointermove", this.onColDividerMove);
        document.addEventListener('pointerup', this.onColDividerUp);
    }

    @action
    onExpanderMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
    }
    @action
    onExpanderUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("pointermove", this.onExpanderMove);
        document.removeEventListener('pointerup', this.onExpanderUp);
        if (this._startSplitPercent == this.splitPercentage) {
            this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, this.splitPercentage == 0 ? 33 : 0);
        }
    }
    onExpanderDown = (e: React.PointerEvent) => {
        this._startSplitPercent = this.splitPercentage;
        e.stopPropagation();
        e.preventDefault();
        document.addEventListener("pointermove", this.onExpanderMove);
        document.addEventListener('pointerup', this.onExpanderUp);
    }

    onPointerDown = (e: React.PointerEvent) => {
        // if (e.button === 2 && this.active) {
        //     e.stopPropagation();
        //     e.preventDefault();
        // } else 
        {
            // if (e.buttons === 1) {
            //     if (this.props.isSelected()) {
            //         e.stopPropagation();
            //     }
            // }
        }
    }

    @action
    onColumnsMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
    }
    @action
    onColumnsUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("pointermove", this.onColumnsMove);
        document.removeEventListener('pointerup', this.onColumnsUp);
        this._columnsPercentage = this._columnsPercentage ? 0 : 50;
    }
    onColumnsDown = (e: React.PointerEvent) => {
        this._startSplitPercent = this.splitPercentage;
        e.stopPropagation();
        e.preventDefault();
        document.addEventListener("pointermove", this.onColumnsMove);
        document.addEventListener('pointerup', this.onColumnsUp);
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

    focusDocument = (doc: Document) => { }

    keyDropDownOnSelect = (keyId: string) => {
        const columns = this.props.Document.GetList(KeyStore.ColumnsKey, [KeyStore.Title, KeyStore.Data, KeyStore.Author]);
        const listOfFields = this.props.Document.GetList<Document>(this.props.fieldKey, [])[1].fields;
        if (listOfFields.has(keyId)) {
            let index = columns.push(listOfFields!.get(keyId)!.key);
            this.props.Document.SetData(KeyStore.ColumnsKey, columns, ListField);
        }
    }

    dropdownItemOnPointerDown = (e: React.PointerEvent): void => {
        //(e.currentTarget.children[0] as Dropdown.Item ).onSelect();
    }

    render() {
        const columns = this.columns;
        const children = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        const selected = children.length > this._selectedIndex ? children[this._selectedIndex] : undefined;
        const allKeys = this.findAllDocumentKeys();
        let content = this._selectedIndex == -1 || !selected ? (null) : (
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div className="collectionSchemaView-content" ref={measureRef}>
                        <DocumentView Document={selected}
                            AddDocument={this.props.addDocument} RemoveDocument={this.props.removeDocument}
                            isTopMost={false}
                            SelectOnLoad={false}
                            ScreenToLocalTransform={this.getTransform}
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
        let previewHandle = !this.props.active() ? (null) : (
            <div className="collectionSchemaView-previewHandle" onPointerDown={this.onExpanderDown} />);
        let columnsHandle = !this.props.active() ? (null) : (
            <div className="collectionSchemaView-columnsHandle" onPointerDown={this.onColumnsDown} />);
        let dividerDragger = this.splitPercentage == 0 ? (null) :
            <div className="collectionSchemaView-dividerDragger" onPointerDown={this.onDividerDown} style={{ width: `${this.DIVIDER_WIDTH}px` }} />
<<<<<<< HEAD

        //get the union of all childrens' keys
        let addFields: { id: string, name: string }[] = [];
        let removeFields: { id: string, name: string }[] = [];
        //children.forEach((child) => {
        //   for (var keyId in fields.keys) {
        //       if (!allFields.includes(keyId)) {
        //           allFields.push(keyId);
        //      }
        //   }
        // });
        let optionsMenu = null;
        if (this.props.active()) {
            let protos = this.props.Document.GetAllPrototypes();
            for (const proto of protos) {
                proto._proxies.forEach((val, key) => {
                    if (!(key in addFields.keys)) {
                        let this_name: string = proto.fields!.get(key)!.key.Name;
                        addFields.push({ id: key, name: this_name });
                    }
                })
            }
            optionsMenu = !this.props.active() ? (null) : (<Flyout
                anchorPoint={anchorPoints.LEFT_TOP}
                content={<div id="options-flyout-div"> <h5>Options</h5>
                    <DropdownButton id="dropdown-basic-button" className="colDropDown" title="Add Column">
                        {addFields.map(({ id, name }) => (
                            <div className="dd-item-containter"><Dropdown.Item className="dd-item" eventKey={id} onSelect={this.keyDropDownOnSelect}>{name} </Dropdown.Item></div>))}
                    </DropdownButton>
                    <DropdownButton id="dropdown-basic-button" className="colDropDown" title="Remove Column">
                        {addFields.map(({ id, name }) => (
                            <div className="dd-item-containter"><Dropdown.Item className="dd-item" eventKey={id} onSelect={this.keyDropDownOnSelect}>{name} </Dropdown.Item></div>))}
                    </DropdownButton>
                </div>
                }>
                <div id="schemaOptionsMenuBtn" />
            </Flyout>);
        }


=======
        let colDividerDragger = this._columnsPercentage == 0 ? (null) :
            <div className="collectionSchemaView-colDividerDragger" onPointerDown={this.onColDividerDown} style={{ height: `${this.DIVIDER_WIDTH}px` }} />
>>>>>>> f70ad315167b714f11f7d68f35a46abe9e525a4d

        return (
            <div className="collectionSchemaView-container" onPointerDown={this.onPointerDown} ref={this._mainCont} style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }} >
                <div className="collectionSchemaView-dropTarget" onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createDropTarget}>
                    <Measure onResize={action((r: any) => {
                        this._dividerX = r.entry.width;
                        this._panelHeight = r.entry.height;
                    })}>
                        {({ measureRef }) =>
                            <div ref={measureRef} className="collectionSchemaView-tableContainer"
                                style={{ width: `calc(100% - ${this.splitPercentage}%)` }}>
                                <div className="collectionSchemaView-reactContainer" style={{ height: `calc(100% - ${this._columnsPercentage}%)` }}>
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
                                </div>
                                {colDividerDragger}
                                <div className="collectionSchemaView-addColumn" style={{ height: `${this._columnsPercentage}%` }} >
                                    {/* <input type="checkbox" id="addColumn-toggle" />
                                    <label htmlFor="addColumn-toggle" title="Add Column"><p>+</p></label> */}

                                    <div className="addColumn-options">
                                        <ul style={{ overflow: "scroll" }}>
                                            {Array.from(Object.keys(allKeys)).map(item => {
                                                return (<KeyToggle checked={allKeys[item]} key={item} keyId={item} toggle={this.toggleKey} />)
                                            })}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        }
                    </Measure>
                    {dividerDragger}
                    <div className="collectionSchemaView-previewRegion" style={{ width: `calc(${this.props.Document.GetNumber(KeyStore.SchemaSplitPercentage, 0)}% - ${this.DIVIDER_WIDTH}px)` }}>
                        {content}
                    </div>
                    {previewHandle}
<<<<<<< HEAD
                    {optionsMenu}
=======
                    {columnsHandle}
>>>>>>> f70ad315167b714f11f7d68f35a46abe9e525a4d

                </div>
            </div >
        )
    }
}