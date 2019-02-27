import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observable, action, configure, reaction, computed } from 'mobx';
import { observer } from "mobx-react";
import * as request from 'request'

@observer
export class WorkspacesMenu extends React.Component {
    static Instance: WorkspacesMenu;
    @observable private workspacesExposed: boolean = false;
    @observable private workspaceIds: Array<string> = [];

    constructor(props: Readonly<{}>) {
        super(props);
        WorkspacesMenu.Instance = this;
    }

    toggle() {
        action(() => {
            if (!this.workspacesExposed) {
                request.get(window.location.origin + "/getAllWorkspaceIds", (error, response, body) => {
                    this.workspaceIds = body;
                    console.log(this.workspaceIds);
                })
            }
            this.workspacesExposed = !this.workspacesExposed;
        });
    }

    render() {
        return (
            <div
                style={{
                    width: "150px",
                    height: "150px",
                    position: "absolute",
                    top: 75,
                    right: 0,
                    background: "grey",
                    zIndex: 15,
                    visibility: this.workspacesExposed ? "visible" : "hidden"
                }}
            >
                {this.workspaceIds.map(s => <li key={s} >${s}</li>)}
            </div>
        );
    }
}