import React = require("react");
import { observer } from "mobx-react";
import "./PropertiesView.scss";
import { observable, action } from "mobx";
import { Doc } from "../../../../fields/Doc";
import { DocumentView } from "../../nodes/DocumentView";


// interface PropertiesViewProps {
//     document: Doc;
//     dataDoc: Doc;
//     docView: DocumentView;
//     width: number;
// }

@observer
export class PropertiesView extends React.Component<{}> {

    render() {
        return <div className="propertiesView" >
            <div className="propertiesView-title">
                Properties
            </div>
            <div className="propertiesView-name">
                Properties
            </div>
            <div className="propertiesView-settings">
                Settings
            </div>
            <div className="propertiesView-fields">
                Fields
            </div>
            <div className="propertiesView-layout">
                Layout
            </div>
        </div>;
    }
} 