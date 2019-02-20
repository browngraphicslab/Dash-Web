import React = require("react")
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
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
                this._splitPercentage += 0.05; // bcz - ugh - needed to force Measure to do its thing and call onResize

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

    innerScreenToLocal(tx: number, ty: number) {
        return () => this.props.ScreenToLocalTransform().transform(new Transform(-tx - 5 - COLLECTION_BORDER_WIDTH, -ty - COLLECTION_BORDER_WIDTH, 1))
    }

    @observable _parentScaling = 1; // used to transfer the dimensions of the content pane in the DOM to the ParentScaling prop of the DocumentView
    @observable _dividerX = 0;
    @observable _dividerY = 0;
    render() {
        const columns = this.props.Document.GetList(KeyStore.ColumnsKey, [KeyStore.Title, KeyStore.Data, KeyStore.Author])
        const children = this.props.Document.GetList<Document>(this.props.fieldKey, []);
        const selected = children.length > this.selectedIndex ? children[this.selectedIndex] : undefined;
        let me = this;
        let content = this.selectedIndex == -1 || !selected ? (null) : (
            <Measure onResize={action((r: any) => this._parentScaling = r.entry.width / selected.GetNumber(KeyStore.NativeWidth, r.entry.width))}>
                {({ measureRef }) =>
                    <div ref={measureRef}>
                        <DocumentView Document={selected}
                            AddDocument={this.addDocument} RemoveDocument={this.removeDocument}
                            ScreenToLocalTransform={this.innerScreenToLocal(me._dividerX, me._dividerY)}//TODO This should probably be an actual transform
                            Scaling={this._parentScaling}
                            isTopMost={false}
                            ContainingCollectionView={me} />
                    </div>
                }
            </Measure>
        )
        return (
            <div onPointerDown={this.onPointerDown} ref={this._mainCont} className="collectionSchemaView-container" style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }} >
                <Measure onResize={action((r: any) => {
                    this._dividerX = r.entry.width;
                })}>
                    {({ measureRef }) =>
                        <div ref={measureRef} className="collectionSchemaView-tableContainer" style={{ position: "relative", float: "left", width: `${this._splitPercentage}%`, height: "100%" }}>
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
                    }
                </Measure>
                <div className="collectionSchemaView-dividerDragger" style={{ position: "relative", background: "black", float: "left", width: "5px", height: "100%" }} onPointerDown={this.onDividerDown} />
                <div className="collectionSchemaView-previewRegion" style={{ position: "relative", float: "left", width: `calc(${100 - this._splitPercentage}% - 5px)`, height: "100%" }}>
                    {content}
                </div>
            </div >
        )
    }
}