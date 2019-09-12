import React = require("react");
import { observable, action } from "mobx";
import { observer } from "mobx-react";
import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faAngleRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { UndoManager } from "../util/UndoManager";

library.add(faAngleRight);

export interface OriginalMenuProps {
    description: string;
    event: (stuff?: any) => void;
    undoable?: boolean;
    icon: IconProp; //maybe should be optional (icon?)
    closeMenu?: () => void;
}

export interface SubmenuProps {
    description: string;
    subitems: ContextMenuProps[];
    icon: IconProp; //maybe should be optional (icon?)
    closeMenu?: () => void;
}

export type ContextMenuProps = OriginalMenuProps | SubmenuProps;

@observer
export class ContextMenuItem extends React.Component<ContextMenuProps & { selected?: boolean }> {
    @observable private _items: Array<ContextMenuProps> = [];
    @observable private overItem = false;

    constructor(props: ContextMenuProps | SubmenuProps) {
        super(props);
        if ("subitems" in this.props) {
            this.props.subitems.forEach(i => this._items.push(i));
        }
    }

    handleEvent = async (e: React.MouseEvent<HTMLDivElement>) => {
        if ("event" in this.props) {
            this.props.closeMenu && this.props.closeMenu();
            let batch: UndoManager.Batch | undefined;
            if (this.props.undoable !== false) {
                batch = UndoManager.StartBatch(`Context menu event: ${this.props.description}`);
            }
            await this.props.event({ x: e.clientX, y: e.clientY });
            batch && batch.end();
        }
    }

    currentTimeout?: any;
    static readonly timeout = 300;
    onPointerEnter = () => {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = undefined;
        }
        if (this.overItem) {
            return;
        }
        this.currentTimeout = setTimeout(action(() => this.overItem = true), ContextMenuItem.timeout);
    }

    onPointerLeave = () => {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = undefined;
        }
        if (!this.overItem) {
            return;
        }
        this.currentTimeout = setTimeout(action(() => this.overItem = false), ContextMenuItem.timeout);
    }

    render() {
        if ("event" in this.props) {
            return (
                <div className={"contextMenu-item" + (this.props.selected ? " contextMenu-itemSelected" : "")} onClick={this.handleEvent}>
                    {this.props.icon ? (
                        <span className="icon-background">
                            <FontAwesomeIcon icon={this.props.icon} size="sm" />
                        </span>
                    ) : null}
                    <div className="contextMenu-description">
                        {this.props.description}
                    </div>
                </div>
            );
        } else if ("subitems" in this.props) {
            let submenu = !this.overItem ? (null) :
                <div className="contextMenu-subMenu-cont" style={{ marginLeft: "25%", left: "0px" }}>
                    {this._items.map(prop => <ContextMenuItem {...prop} key={prop.description} closeMenu={this.props.closeMenu} />)}
                </div>;
            return (
                <div className={"contextMenu-item" + (this.props.selected ? " contextMenu-itemSelected" : "")} onMouseLeave={this.onPointerLeave}>
                    {this.props.icon ? (
                        <span className="icon-background">
                            <FontAwesomeIcon icon={this.props.icon} size="sm" />
                        </span>
                    ) : null}
                    <div className="contextMenu-description" onMouseEnter={this.onPointerEnter} >
                        {this.props.description}
                        <FontAwesomeIcon icon={faAngleRight} size="lg" style={{ position: "absolute", right: "10px" }} />
                    </div>
                    {submenu}
                </div>
            );
        }
    }
}