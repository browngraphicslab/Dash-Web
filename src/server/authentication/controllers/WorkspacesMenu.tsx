import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observable, action, configure, reaction, computed } from 'mobx';
import { observer } from "mobx-react";
import * as request from 'request'
import './WorkspacesMenu.css'

@observer
export class WorkspacesMenu extends React.Component {
    static Instance: WorkspacesMenu;
    @observable private workspacesExposed: boolean = false;
    @observable private workspaceIds: Array<string> = [];

    constructor(props: Readonly<{}>) {
        super(props);
        WorkspacesMenu.Instance = this;
    }

    @action
    toggle() {
        if (this.workspacesExposed) {
            this.workspacesExposed = !this.workspacesExposed;
        } else {
            request.get(window.location.origin + "/getAllWorkspaceIds", this.idCallback)
        }
    }

    @action.bound
    idCallback: request.RequestCallback = (error, response, body) => {
        this.workspaceIds = [];
        let ids: Array<string> = JSON.parse(body) as Array<string>;
        if (ids) {
            for (let i = 0; i < ids.length; i++) {
                this.workspaceIds.push(ids[i]);
            }
            console.log(this.workspaceIds);
            this.workspacesExposed = !this.workspacesExposed;
        }
    }

    setWorkspaceId = (e: React.MouseEvent) => {
        console.log(e.currentTarget.innerHTML);
    }

    render() {
        return (
            <div
                style={{
                    width: "auto",
                    height: "auto",
                    borderRadius: 5,
                    position: "absolute",
                    top: 50,
                    left: this.workspacesExposed ? 8 : -500,
                    background: "white",
                    border: "black solid 2px",
                    transition: "all 1s ease",
                    zIndex: 15,
                    padding: 10,
                }}
            >
                {this.workspaceIds.map(s =>
                    <li className={"ids"}
                        key={s}
                        style={{
                            listStyleType: "none",
                            paddingTop: 3,
                            paddingBottom: 3
                        }}
                        onClick={this.setWorkspaceId}
                    >{s}</li>
                )}
            </div>
        );
    }
}