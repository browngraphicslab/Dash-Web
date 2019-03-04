import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observable, action, configure, reaction, computed, ObservableMap, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as request from 'request'
import './WorkspacesMenu.css'

export interface WorkspaceMenuProps {
    active: string;
    load: (workspaceId: string) => void;
    new: () => string;
}

@observer
export class WorkspacesMenu extends React.Component<WorkspaceMenuProps> {
    static Instance: WorkspacesMenu;
    @observable private workspacesExposed: boolean = false;
    @observable private workspaceIds: Array<string> = [];
    @observable private selectedWorkspaceId: string = "";

    constructor(props: WorkspaceMenuProps) {
        super(props);
        WorkspacesMenu.Instance = this;
        this.loadExistingWorkspace = this.loadExistingWorkspace.bind(this);
        this.addNewWorkspace = this.addNewWorkspace.bind(this);
        this.selectedWorkspaceId = this.props.active;
    }

    @action
    addNewWorkspace() {
        let newId = this.props.new();
        this.selectedWorkspaceId = newId;
        this.props.load(newId);
        this.toggle();
    }

    @action
    loadExistingWorkspace = (e: React.MouseEvent<HTMLLIElement, MouseEvent>) => {
        let id = e.currentTarget.innerHTML;
        this.props.load(id);
        this.selectedWorkspaceId = id;
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
            this.workspacesExposed = !this.workspacesExposed;
        }
    }

    render() {
        let p = this.props;
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
                <img
                    src="https://bit.ly/2IBBkxk"
                    style={{
                        width: 20,
                        height: 20,
                        marginBottom: 10,
                        cursor: "grab"
                    }}
                    onClick={this.addNewWorkspace}
                />
                {this.workspaceIds.map(s =>
                    <li className={"ids"}
                        key={s}
                        style={{
                            listStyleType: "none",
                            color: s === this.selectedWorkspaceId ? "darkblue" : "black",
                            cursor: "grab"
                        }}
                        onClick={this.loadExistingWorkspace}
                    >{s}</li>
                )}
            </div>
        );
    }
}