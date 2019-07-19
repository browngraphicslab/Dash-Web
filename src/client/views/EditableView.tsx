import React = require('react');
import { observer } from 'mobx-react';
import { observable, action, trace } from 'mobx';
import "./EditableView.scss";

export interface EditableProps {
    /**
     * Called to get the initial value for editing
     *  */
    GetValue(): string;

    /**
     * Called to apply changes
     * @param value - The string entered by the user to set the value to
     * @returns `true` if setting the value was successful, `false` otherwise
     *  */
    SetValue(value: string, shiftDown?: boolean): boolean;

    OnFillDown?(value: string): void;

    OnTab?(): void;

    /**
     * The contents to render when not editing
     */
    contents: any;
    fontStyle?: string;
    fontSize?: number;
    height?: number;
    display?: string;
    oneLine?: boolean;
    editing?: boolean;
    onClick?: (e: React.MouseEvent) => boolean;
    isEditingCallback?:  (isEditing: boolean) => void;
}

/**
 * Customizable view that can be given an arbitrary view to render normally,
 * but can also be edited with customizable functions to get a string version
 * of the content, and set the value based on the entered string.
 */
@observer
export class EditableView extends React.Component<EditableProps> {
    @observable _editing: boolean = false;

    constructor(props: EditableProps) {
        super(props);
        this._editing = this.props.editing ? true : false;
    }

    @action
    componentWillReceiveProps(nextProps: EditableProps) {
        this._editing = nextProps.editing ? true : false;
    }

    @action
    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Tab") {
            this.props.OnTab && this.props.OnTab();
        } else if (e.key === "Enter") {
            if (!e.ctrlKey) {
                if (this.props.SetValue(e.currentTarget.value, e.shiftKey)) {
                    this._editing = false;
                    this.props.isEditingCallback && this.props.isEditingCallback(false);
                }
            } else if (this.props.OnFillDown) {
                this.props.OnFillDown(e.currentTarget.value);
                this._editing = false;
                this.props.isEditingCallback && this.props.isEditingCallback(false);
            }
        } else if (e.key === "Escape") {
            this._editing = false;
            this.props.isEditingCallback && this.props.isEditingCallback(false);
        }
    }

    @action
    onClick = (e: React.MouseEvent) => {
        if (!this.props.onClick || !this.props.onClick(e)) {
            this._editing = true;
            this.props.isEditingCallback && this.props.isEditingCallback(true);
        } 
        e.stopPropagation();
    }

    stopPropagation(e: React.SyntheticEvent) {
        e.stopPropagation();
    }

    @action
    setIsFocused = (value: boolean) => {
        this._editing = value;
    }

    render() {
        if (this._editing) {
            return <input className="editableView-input" defaultValue={this.props.GetValue()} onKeyDown={this.onKeyDown} autoFocus
                onBlur={action(() => {this._editing = false; this.props.isEditingCallback && this.props.isEditingCallback(false);})} onPointerDown={this.stopPropagation} onClick={this.stopPropagation} onPointerUp={this.stopPropagation}
                style={{ display: this.props.display, fontSize: this.props.fontSize }} />;
        } else {
            return (
                <div className={`editableView-container-editing${this.props.oneLine ? "-oneLine" : ""}`}
                    style={{ display: this.props.display, height: "auto", maxHeight: `${this.props.height}` }}
                    onClick={this.onClick} >
                    <span style={{ fontStyle: this.props.fontStyle }}>{this.props.contents}</span>
                </div>
            );
        }
    }
}