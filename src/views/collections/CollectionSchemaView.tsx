import { CollectionViewProps, DocumentFieldViewProps } from "../nodes/DocumentView";
import React = require("react")
import ReactTable, { ReactTableDefaults, CellInfo } from "react-table";
import { observer } from "mobx-react";
import { KeyStore as KS, Key } from "../../fields/Key";
import { Document } from "../../fields/Document";
import { FieldView } from "../nodes/FieldView";
import "react-table/react-table.css"

@observer
export class CollectionSchemaView extends React.Component<CollectionViewProps> {
    public static LayoutString() { return '<CollectionSchemaView Document={Document} fieldKey={DataKey} ContainingDocumentView={ContainingDocumentView}/>'; }

    renderCell = (rowProps: CellInfo) => {
        if (!this.props.ContainingDocumentView) {
            return <div></div>
        }
        let props: DocumentFieldViewProps = {
            doc: rowProps.value[0],
            fieldKey: rowProps.value[1],
            containingDocumentView: this.props.ContainingDocumentView
        }
        return <FieldView {...props} />
    }

    render() {
        const { Document, fieldKey } = this.props;
        const children = Document.GetListField<Document>(fieldKey, []);
        const columns = Document.GetListField(KS.ColumnsKey,
            [KS.Title, KS.Data, KS.Author])
        return (
            <ReactTable
                data={children}
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
            />
        )
    }
}