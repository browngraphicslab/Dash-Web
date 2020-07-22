import React = require("react");
import { observer } from "mobx-react";
import "./PropertiesView.scss";
import { observable, action, computed } from "mobx";
import { Doc, Field, DocListCast } from "../../../../fields/Doc";
import { DocumentView } from "../../nodes/DocumentView";
import { ComputedField } from "../../../../fields/ScriptField";
import { EditableView } from "../../EditableView";
import { KeyValueBox } from "../../nodes/KeyValueBox";
import { Cast } from "../../../../fields/Types";
import { listSpec } from "../../../../fields/Schema";


interface PropertiesViewProps {
    document: Doc;
    //dataDoc: Doc;
    //docView: DocumentView;
}

@observer
export class PropertiesView extends React.Component<PropertiesViewProps> {

    @computed get expandedField() {
        const ids: { [key: string]: string } = {};
        const doc = this.props.document;
        doc && Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key));

        const rows: JSX.Element[] = [];
        for (const key of Object.keys(ids).slice().sort()) {
            const contents = doc[key];
            let contentElement: (JSX.Element | null)[] | JSX.Element = [];
            contentElement = <EditableView key="editableView"
                contents={contents !== undefined ? Field.toString(contents as Field) : "null"}
                height={13}
                fontSize={10}
                GetValue={() => Field.toKeyValueString(doc, key)}
                SetValue={(value: string) => KeyValueBox.SetField(doc, key, value, true)}
            />;

            rows.push(<div style={{ display: "flex", overflowY: "visible", marginBottom: "-1px" }} key={key}>
                <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key + ":"}</span>
                &nbsp;
                {contentElement}
            </div>);
        }
        return rows;
    }

    @computed get layoutPreview() {
        return "layout";
    }

    render() {
        return <div className="propertiesView" >
            <div className="propertiesView-title">
                Properties
            </div>
            <div className="propertiesView-name">
                Collection
            </div>
            <div className="propertiesView-settings">
                Settings
            </div>
            <div className="propertiesView-fields">
                <div className="propertiesView-fields-title"> Fields</div>
                <div className="propertiesView-fields-content"> {this.expandedField} </div>
            </div>
            <div className="propertiesView-layout">
                <div>Layout</div>
                <div>{this.layoutPreview}</div>
            </div>
        </div>;
    }
} 