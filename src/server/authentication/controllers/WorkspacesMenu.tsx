import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observable, action, configure, reaction, computed, ObservableMap, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as request from 'request'
import './WorkspacesMenu.css'
import { Document } from '../../../fields/Document';
import { Server } from '../../../client/Server';
import { Field } from '../../../fields/Field';

export interface WorkspaceMenuProps {
    active: Document;
    open: (workspace: Document) => void;
    new: (init: boolean) => void;
    allWorkspaces: Document[];
}

@observer
export class WorkspacesMenu extends React.Component<WorkspaceMenuProps> {
    static Instance: WorkspacesMenu;
    @observable private workspacesExposed: boolean = false;

    constructor(props: WorkspaceMenuProps) {
        super(props);
        WorkspacesMenu.Instance = this;
        this.addNewWorkspace = this.addNewWorkspace.bind(this);
    }

    @action
    addNewWorkspace() {
        this.props.new(false);
        this.toggle();
    }

    @action
    toggle() {
        this.workspacesExposed = !this.workspacesExposed;
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
                    top: 55,
                    left: this.workspacesExposed ? 11 : -500,
                    background: "white",
                    border: "black solid 2px",
                    transition: "all 1s ease",
                    zIndex: 15,
                    padding: 10,
                    paddingRight: 12,
                }}>
                <img
                    src="https://bit.ly/2IBBkxk"
                    style={{
                        width: 20,
                        height: 20,
                        marginTop: 3,
                        marginLeft: 3,
                        marginBottom: 3,
                        cursor: "grab"
                    }}
                    onClick={this.addNewWorkspace}
                />
                {this.props.allWorkspaces.map(s =>
                    <li className={"ids"}
                        key={s.Id}
                        style={{
                            listStyleType: "none",
                            color: s.Id === this.props.active.Id ? "darkblue" : "black",
                            cursor: "grab"
                        }}
                        onClick={() => {
                            this.props.open(s);
                            console.log(this.props.allWorkspaces.length);
                        }}
                    >{s.Title}</li>
                )}
            </div>
        );
    }
}