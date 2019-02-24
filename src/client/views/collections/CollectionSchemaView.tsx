import React = require("react")
import { action, observable, trace } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import ReactTable, { CellInfo, ComponentPropsGetterR, ReactTableDefaults } from "react-table";
import "react-table/react-table.css";
import { Document } from "../../../fields/Document";
import { Field, FieldWaiting } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { CompileScript, ToField } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { EditableView } from "../EditableView";
import { DocumentView } from "../nodes/DocumentView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./CollectionSchemaView.scss";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { CollectionViewBase } from "./CollectionViewBase";

@observer
export class CollectionSchemaView extends CollectionViewBase {
    private _mainCont = React.createRef<HTMLDivElement>();
    private DIVIDER_WIDTH = 5;

    @observable _contentScaling = 1; // used to transfer the dimensions of the content pane in the DOM to the ContentScaling prop of the DocumentView
    @observable _dividerX = 0;
    @observable _panelWidth = 0;
    @observable _panelHeight = 0;
    @observable _selectedIndex = 0;
    @observable _splitPercentage: number = 50;

    renderCell = (rowProps: CellInfo) => {
        let props: FieldViewProps = {
            doc: rowProps.value[0],
            fieldKey: rowProps.value[1],
            isSelected: () => false,
            select: () => { },
            isTopMost: false,
            bindings: {}
        }
        let contents = (
            <FieldView {...props} />
        )
        return (
            <EditableView contents={contents} height={36} GetValue={() => {
                let field = props.doc.Get(props.fieldKey);
                if (field && field instanceof Field) {
                    return field.ToScriptString();
                }
                return field || "";
            }} SetValue={(value: string) => {
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
            }}></EditableView>
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
                this._splitPercentage += 0.05; // bcz - ugh - needed to force Measure to do its thing and call onResize

                if (handleOriginal) {
                    handleOriginal()
                }
            }),
            style: {
                background: rowInfo.index == this._selectedIndex ? "#00afec" : "white",
                color: rowInfo.index == this._selectedIndex ? "white" : "black"
            }
        };
    }

    @action
    onDividerMove = (e: PointerEvent): void => {
        let nativeWidth = this._mainCont.current!.getBoundingClientRect();
        this._splitPercentage = Math.round((e.clientX - nativeWidth.left) / nativeWidth.width * 100);
    }
    onDividerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
    }
    onDividerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        document.addEventListener("pointermove", this.onDividerMove);
        document.addEventListener('pointerup', this.onDividerUp);
    }

    onPointerDown = (e: React.PointerEvent) => {
        // if (e.button === 2 && this.active) {
        //     e.stopPropagation();
        //     e.preventDefault();
        // } else 
        {
            if (e.buttons === 1 && this.props.active()) {
                e.stopPropagation();
            }
        }
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

    render() {
        const columns = this.props.Document.GetList(KeyStore.ColumnsKey, [KeyStore.Title, KeyStore.Data, KeyStore.Author])
        const children = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        const selected = children.length > this._selectedIndex ? children[this._selectedIndex] : undefined;
        let content = this._selectedIndex == -1 || !selected ? (null) : (
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div ref={measureRef}>
                        <DocumentView Document={selected}
                            AddDocument={this.props.addDocument} RemoveDocument={this.props.removeDocument}
                            isTopMost={false}
                            ScreenToLocalTransform={this.getTransform}
                            ContentScaling={this.getContentScaling}
                            PanelWidth={this.getPanelWidth}
                            PanelHeight={this.getPanelHeight}
                            ContainingCollectionView={this.props.CollectionView} />
                    </div>
                }
            </Measure>
        )
        return (
            <div onPointerDown={this.onPointerDown} ref={this._mainCont} className="collectionSchemaView-container" style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }} >
                <Measure onResize={action((r: any) => {
                    this._dividerX = r.entry.width;
                    this._panelHeight = r.entry.height;
                })}>
                    {({ measureRef }) =>
                        <div ref={measureRef} className="collectionSchemaView-tableContainer" style={{ position: "relative", float: "left", width: `${this._splitPercentage}%`, height: "100%" }}>
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
                                    Cell: this.renderCell
                                }}
                                getTrProps={this.getTrProps}
                            />
                        </div>
                    }
                </Measure>
                <div className="collectionSchemaView-dividerDragger" style={{ position: "relative", background: "black", float: "left", width: `${this.DIVIDER_WIDTH}px`, height: "100%" }} onPointerDown={this.onDividerDown} />
                <div className="collectionSchemaView-previewRegion"
                    onDrop={(e: React.DragEvent) => this.onDrop(e, {})}
                    ref={this.createDropTarget}
                    style={{ position: "relative", float: "left", width: `calc(${100 - this._splitPercentage}% - ${this.DIVIDER_WIDTH}px)`, height: "100%" }}>
                    {content}
                </div>
            </div >
        )
    }
}