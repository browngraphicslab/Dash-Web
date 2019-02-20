import React = require("react")
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import SplitPane from "react-split-pane";
import ReactTable, { CellInfo, ComponentPropsGetterR, ReactTableDefaults } from "react-table";
import "react-table/react-table.css";
import { Document } from "../../../fields/Document";
import { Field } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { CompileScript, ToField } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { EditableView } from "../EditableView";
import { DocumentView } from "../nodes/DocumentView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./CollectionSchemaView.scss";
import { CollectionViewBase, COLLECTION_BORDER_WIDTH } from "./CollectionViewBase";
import { relative } from "path";

@observer
export class CollectionSchemaView extends CollectionViewBase {
    public static LayoutString(fieldKey: string = "DataKey") { return CollectionViewBase.LayoutString("CollectionSchemaView", fieldKey); }

    private _mainCont = React.createRef<HTMLDivElement>();

    @observable
    selectedIndex = 0;

    @observable
    _splitPercentage: number = 50;

    renderCell = (rowProps: CellInfo) => {
        let props: FieldViewProps = {
            doc: rowProps.value[0],
            fieldKey: rowProps.value[1],
            isSelected: () => false,
            isTopMost: false
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
                that.selectedIndex = rowInfo.index;
                const doc: Document = rowInfo.original;
                console.log("Row clicked: ", doc.Title)

                if (handleOriginal) {
                    handleOriginal()
                }
            }),
            style: {
                background: rowInfo.index == this.selectedIndex ? "#00afec" : "white",
                color: rowInfo.index == this.selectedIndex ? "white" : "black"
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
            if (e.buttons === 1 && this.active) {
                e.stopPropagation();
            }
        }
    }


    @observable
    private _parentScaling = 1; // used to transfer the dimensions of the content pane in the DOM to the ParentScaling prop of the DocumentView
    render() {
        const { Document: Document, fieldKey: fieldKey } = this.props;
        const children = Document.GetList<Document>(fieldKey, []);
        const columns = Document.GetList(KeyStore.ColumnsKey,
            [KeyStore.Title, KeyStore.Data, KeyStore.Author])
        let content = <div></div>
        let me = this;
        if (this.selectedIndex != -1) {
            content = (
                <Measure onResize={action((r: any) => {
                    var doc = children[this.selectedIndex];
                    var n = doc.GetNumber(KeyStore.NativeWidth, 0);
                    if (n > 0 && r.entry.width > 0) {
                        this._parentScaling = r.entry.width / n;
                    }
                })}>
                    {({ measureRef }) =>
                        <div ref={measureRef}>
                            <DocumentView Document={children[this.selectedIndex]}
                                AddDocument={this.addDocument} RemoveDocument={this.removeDocument}
                                ScreenToLocalTransform={() => Transform.Identity}//TODO This should probably be an actual transform
                                Scaling={this._parentScaling}
                                isTopMost={false}
                                ContainingCollectionView={me} />
                        </div>
                    }
                </Measure>
            )
        }
        let nativeWidth = Document.GetNumber(KeyStore.NativeWidth, 0);
        return (
            <div onPointerDown={this.onPointerDown} ref={this._mainCont} className="collectionSchemaView-container"
                style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }} >
                <div className="collectionSchemaView-tableContainer" style={{ position: "relative", float: "left", width: `${this._splitPercentage}%`, height: "100%" }}>
                    <ReactTable
                        data={children}
                        pageSize={children.length}
                        page={0}
                        showPagination={false}
                        columns={columns.map(col => {
                            return (
                                {
                                    Header: col.Name,
                                    accessor: (doc: Document) => [doc, col],
                                    id: col.Id
                                })
                        })}
                        column={{
                            ...ReactTableDefaults.column,
                            Cell: this.renderCell
                        }}
                        getTrProps={this.getTrProps}
                    />
                </div>
                <div onPointerDown={this.onDividerDown} style={{ position: "relative", background: "black", float: "left", width: "5px", height: "100%" }}>

                </div>
                <div style={{ position: "relative", float: "left", width: `calc(${100 - this._splitPercentage}% - 5px)`, height: "100%" }}>
                    <Measure onResize={action((r: any) => this._parentScaling = nativeWidth > 0 ? r.entry.width / nativeWidth : 1)}>
                        {({ measureRef }) => <div ref={measureRef}>  {content} </div>}
                    </Measure>
                </div>
            </div >
        )
    }
}