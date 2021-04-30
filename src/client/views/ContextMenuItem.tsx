import React = require("react");
import { observable, action } from "mobx";
import { observer } from "mobx-react";
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { UndoManager } from "../util/UndoManager";

export interface OriginalMenuProps {
    description: string;
    event: (stuff?: any) => void;
    undoable?: boolean;
    icon: IconProp; //maybe should be optional (icon?)
    shortcut?: string;
    closeMenu?: () => void;
}

export interface SubmenuProps {
    description: string;
    subitems: ContextMenuProps[];
    noexpand?: boolean;
    addDivider?: boolean;
    icon: IconProp; //maybe should be optional (icon?)
    shortcut?: string;
    closeMenu?: () => void;
}

export type ContextMenuProps = OriginalMenuProps | SubmenuProps;

@observer
export class ContextMenuItem extends React.Component<ContextMenuProps & { selected?: boolean }> {
    @observable private _items: Array<ContextMenuProps> = [];
    @observable private overItem = false;
    @observable private subRef = React.createRef<HTMLDivElement>();

    constructor(props: ContextMenuProps | SubmenuProps) {
        super(props);
        if ((this.props as SubmenuProps).subitems) {
            (this.props as SubmenuProps).subitems?.forEach(i => this._items.push(i));
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
            batch?.end();
        }
    }

    currentTimeout?: any;
    static readonly timeout = 300;
    _overPosY = 0;
    _overPosX = 0;
    onPointerEnter = (e: React.MouseEvent) => {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = undefined;
        }
        if (this.overItem) {
            return;
        }
        this._overPosY = e.clientY;
        this._overPosX = e.clientX;
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
                <div className={"contextMenu-item" + (this.props.selected ? " contextMenu-itemSelected" : "")} onPointerDown={this.handleEvent}>
                    {this.props.icon ? (
                        <span className="icon-background">
                            <FontAwesomeIcon icon={this.props.icon} size="sm" />
                        </span>
                    ) : null}
                    <div className="contextMenu-description">
                        {this.props.description}
                    </div>
                    {this.props.shortcut ? (
                        <div className="contextMenu-shortcut">
                            {this.props.shortcut}
                        </div>
                    ) : null}
                </div>
            );
        } else if ("subitems" in this.props) {
            const where = !this.overItem ? "" : this._overPosY < window.innerHeight / 3 ? "flex-start" : this._overPosY > window.innerHeight * 2 / 3 ? "flex-end" : "center";
            const marginTop = !this.overItem ? "" : this._overPosY < window.innerHeight / 3 ? "20px" : this._overPosY > window.innerHeight * 2 / 3 ? "-20px" : "";

            // here
            const submenu = !this.overItem ? (null) :
                <div className="contextMenu-subMenu-cont"
                    style={{
                        marginLeft: window.innerHeight - this._overPosX - 50 > 0 ? "90%" : "20%", marginTop
                    }}>
                    {this._items.map(prop => <ContextMenuItem {...prop} key={prop.description} closeMenu={this.props.closeMenu} />)}
                </div>;
            if (!(this.props as SubmenuProps).noexpand) {
                return <div className="contextMenu-inlineMenu">
                    {this._items.map(prop => <ContextMenuItem {...prop} key={prop.description} closeMenu={this.props.closeMenu} />)}
                </div>;
            }
            return (
                <div className={"contextMenu-item" + (this.props.selected ? " contextMenu-itemSelected" : "")}
                    style={{ alignItems: where, borderTop: this.props.addDivider ? "solid 1px" : undefined }}
                    onMouseLeave={this.onPointerLeave} onMouseEnter={this.onPointerEnter}>
                    {this.props.icon ? (
                        <span className="icon-background" onMouseEnter={this.onPointerLeave} style={{ alignItems: "center" }}>
                            <FontAwesomeIcon icon={this.props.icon} size="sm" />
                        </span>
                    ) : null}
                    <div className="contextMenu-description" onMouseEnter={this.onPointerEnter}
                        style={{ alignItems: "center" }} >
                        {this.props.description}
                        <FontAwesomeIcon icon={"angle-right"} size="lg" style={{ position: "absolute", right: "10px" }} />
                    </div>
                    {this.props.shortcut ? (
                        <div className="contextMenu-shortcut">
                            {this.props.shortcut}
                        </div>
                    ) : null}
                    {submenu}
                </div>
            );
        }
    }
}