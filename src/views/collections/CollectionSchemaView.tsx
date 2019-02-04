import { CollectionViewProps, DocumentFieldViewProps, DocumentView, DocumentContents } from "../nodes/DocumentView";
import React = require("react")
import ReactTable, { ReactTableDefaults, CellInfo, ComponentPropsGetterRC, ComponentPropsGetterR } from "react-table";
import { observer } from "mobx-react";
import { KeyStore as KS, Key } from "../../fields/Key";
import { Document } from "../../fields/Document";
import { FieldView } from "../nodes/FieldView";
import "react-table/react-table.css"
import { observable, action } from "mobx";
import SplitPane from "react-split-pane"
import "./CollectionSchemaView.scss"
import { ScrollBox } from "../../util/ScrollBox";

@observer
export class CollectionSchemaView extends React.Component<CollectionViewProps> {
    public static LayoutString() { return '<CollectionSchemaView Document={Document} fieldKey={DataKey} ContainingDocumentView={ContainingDocumentView}/>'; }

    @observable
    selectedIndex = 0;

    renderCell = (rowProps: CellInfo) => {
        if (!this.props.ContainingDocumentView) {
            return <div></div>
        }
        let props: DocumentFieldViewProps = {
            doc: rowProps.value[0],
            fieldKey: rowProps.value[1],
            containingDocumentView: this.props.ContainingDocumentView
        }
        return (
            <FieldView {...props} />
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

    onPointerDown = (e: React.PointerEvent) => {
        let target = e.target as HTMLElement;
        if (target.tagName == "SPAN" && target.className.includes("Resizer")) {
            e.stopPropagation();
        }
    }

    render() {
        const { Document, fieldKey } = this.props;
        const children = Document.GetListField<Document>(fieldKey, []);
        const columns = Document.GetListField(KS.ColumnsKey,
            [KS.Title, KS.Data, KS.Author])
        let content;
        if (this.selectedIndex != -1) {
            content = (<DocumentContents Document={children[this.selectedIndex]}
                ContainingDocumentView={this.props.ContainingDocumentView}
                ContainingCollectionView={undefined} />)
        } else {
            content = <div />
        }
        return (
            <div onPointerDown={this.onPointerDown} >
                <SplitPane split={"vertical"} defaultSize="60%">
                    <ScrollBox>
                        <ReactTable
                            data={children}
                            pageSize={children.length}
                            page={0}
                            showPagination={false}
                            style={{
                                display: "inline-block"
                            }}
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
                    </ScrollBox>
                    {content}
                </SplitPane>
            </div>
        )
    }
}