import * as React from 'react';
import { observable, action, configure, reaction, computed, ObservableMap, runInAction } from 'mobx';
import { observer } from "mobx-react";
import './WorkspacesMenu.css';
import { EditableView } from '../../../client/views/EditableView';
import { Doc } from '../../../new_fields/Doc';
import { StrCast } from '../../../new_fields/Types';
import { Id } from '../../../new_fields/RefField';

export interface WorkspaceMenuProps {
    active: Doc | undefined;
    open: (workspace: Doc) => void;
    new: () => void;
    allWorkspaces: Doc[];
    isShown: () => boolean;
    toggle: () => void;
}

@observer
export class WorkspacesMenu extends React.Component<WorkspaceMenuProps> {
    constructor(props: WorkspaceMenuProps) {
        super(props);
        this.addNewWorkspace = this.addNewWorkspace.bind(this);
    }

    @action
    addNewWorkspace() {
        this.props.new();
        this.props.toggle();
    }

    render() {
        return (
            <div
                style={{
                    width: "auto",
                    maxHeight: '200px',
                    overflow: 'scroll',
                    borderRadius: 5,
                    position: "absolute",
                    top: 78,
                    left: this.props.isShown() ? 11 : -500,
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
                {this.props.allWorkspaces.map((s, i) =>
                    <div
                        key={s[Id]}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            this.props.open(s);
                        }}
                        style={{
                            marginTop: 10,
                            color: s === this.props.active ? "red" : "black"
                        }}
                    >
                        <span>{i + 1} - </span>
                        <EditableView
                            display={"inline"}
                            GetValue={() => StrCast(s.title)}
                            SetValue={(title: string): boolean => {
                                s.title = title;
                                return true;
                            }}
                            contents={s.Title}
                            height={20}
                        />
                    </div>
                )}
            </div>
        );
    }
}