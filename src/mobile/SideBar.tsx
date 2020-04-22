import React = require("react");
import { observer } from "mobx-react";
import "./SideBar.scss";
import { computed } from "mobx";
import { DocumentView } from '../client/views/nodes/DocumentView';



@observer
export class SideBar extends React.Component<{ views: (DocumentView | undefined)[], stack?: any }, {}>{

    constructor(props: { views: (DocumentView | undefined)[] }) {
        super(props);
    }

    @computed
    onClick() {
        document.getElementsByClassName('sidebar')
        [0].classList.toggle('active');
    }

    render() {
        return (
            <>
                <div className="navbar">
                    <div className="toggle-btn" onClick={this.onClick}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
                <div className="sidebar">
                    <div className="item">Workspace1</div>
                    <div className="item">Workspace2</div>
                    <div className="item">Workspace3</div>
                </div>
            </>
        );
    }

}