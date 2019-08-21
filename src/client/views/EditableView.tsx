import React = require('react');
import { observer } from 'mobx-react';
import { observable, action, trace } from 'mobx';
import "./EditableView.scss";
import * as Autosuggest from 'react-autosuggest';
import { SchemaHeaderField } from '../../new_fields/SchemaHeaderField';

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
    autosuggestProps?: {
        resetValue: () => void;
        value: string,
        onChange: (e: React.ChangeEvent, { newValue }: { newValue: string }) => void,
        autosuggestProps: Autosuggest.AutosuggestProps<string>

    };
    oneLine?: boolean;
    editing?: boolean;
    onClick?: (e: React.MouseEvent) => boolean;
    isEditingCallback?: (isEditing: boolean) => void;
    // HeadingObject: SchemaHeaderField | undefined;
    // HeadingsHack: number;
}

/**
 * Customizable view that can be given an arbitrary view to render normally,
 * but can also be edited with customizable functions to get a string version
 * of the content, and set the value based on the entered string.
 */
@observer
export class EditableView extends React.Component<EditableProps> {
    @observable _editing: boolean = false;
    @observable _collapsed: boolean = false;
    @observable _headingsHack: number = 1;

    constructor(props: EditableProps) {
        super(props);
        this._editing = this.props.editing ? true : false;
    }

    @action
    componentWillReceiveProps(nextProps: EditableProps) {
        // this is done because when autosuggest is turned on, the suggestions are passed in as a prop,
        // so when the suggestions are passed in, and no editing prop is passed in, it used to set it
        // to false. this will no longer do so -syip
        if (nextProps.editing && nextProps.editing !== this._editing) {
            this._editing = nextProps.editing;
        }
    }

    // collapseSection() {
    //     if (this.props.HeadingObject) {
    //         this._headingsHack++;
    //         this.props.HeadingObject.setCollapsed(!this.props.HeadingObject.collapsed);
    //         this._collapsed = !this._collapsed;
    //         console.log("THIS IS COLLAPSE FROM EDITABLEVIEW" + this._collapsed);
    //     }
    // }

    @action
    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Tab") {
            e.stopPropagation();
            this.props.OnTab && this.props.OnTab();
        } else if (e.key === "Enter") {
            e.stopPropagation();
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
            e.stopPropagation();
            this._editing = false;
            this.props.isEditingCallback && this.props.isEditingCallback(false);
        }
    }

    @action
    onClick = (e: React.MouseEvent) => {
        e.nativeEvent.stopPropagation();
        // if (e.ctrlKey) {
        //     this.collapseSection();
        // }
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
            return this.props.autosuggestProps
                ? <Autosuggest
                    {...this.props.autosuggestProps.autosuggestProps}
                    inputProps={{
                        className: "editableView-input",
                        onKeyDown: this.onKeyDown,
                        autoFocus: true,
                        onBlur: action(() => this._editing = false),
                        onPointerDown: this.stopPropagation,
                        onClick: this.stopPropagation,
                        onPointerUp: this.stopPropagation,
                        value: this.props.autosuggestProps.value,
                        onChange: this.props.autosuggestProps.onChange
                    }}
                />
                : <input className="editableView-input" defaultValue={this.props.GetValue()} onKeyDown={this.onKeyDown} autoFocus
                    onBlur={action(() => { this._editing = false; this.props.isEditingCallback && this.props.isEditingCallback(false); })} onPointerDown={this.stopPropagation} onClick={this.stopPropagation} onPointerUp={this.stopPropagation}
                    style={{ display: this.props.display, fontSize: this.props.fontSize }} />;
        } else {
            if (this.props.autosuggestProps) this.props.autosuggestProps.resetValue();
            return (
                <div className={`editableView-container-editing${this.props.oneLine ? "-oneLine" : ""}`}
                    style={{ display: this.props.display, height: "auto", maxHeight: `${this.props.height}` }}
                    onClick={this.onClick}>
                    <span style={{ fontStyle: this.props.fontStyle, fontSize: this.props.fontSize }}>{this.props.contents}</span>
                </div>
            );
        }
    }
}