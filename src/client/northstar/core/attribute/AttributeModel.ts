import { Attribute, DataType, VisualizationHint } from '../../model/idea/idea'
import { BaseObject } from '../BaseObject'
import { observable } from "mobx";

export abstract class AttributeModel extends BaseObject {
    public abstract get DisplayName(): string;
    public abstract get CodeName(): string;
    public abstract get DataType(): DataType;
    public abstract get VisualizationHints(): VisualizationHint[];
}

export class ColumnAttributeModel extends AttributeModel {
    public Attribute: Attribute;

    constructor(attribute: Attribute) {
        super();
        this.Attribute = attribute;
    }

    public get DataType(): DataType {
        return this.Attribute.dataType ? this.Attribute.dataType : DataType.Undefined;
    }

    public get DisplayName(): string {
        return this.Attribute.displayName ? this.Attribute.displayName.ReplaceAll("_", " ") : "";
    }

    public get CodeName(): string {
        return this.Attribute.rawName ? this.Attribute.rawName : "";
    }

    public get VisualizationHints(): VisualizationHint[] {
        return this.Attribute.visualizationHints ? this.Attribute.visualizationHints : [];
    }

    public Equals(other: ColumnAttributeModel): boolean {
        return this.Attribute.rawName == other.Attribute.rawName;
    }
}

export class CodeAttributeModel extends AttributeModel {
    private _visualizationHints: VisualizationHint[];

    public CodeName: string;

    @observable
    public Code: string;

    constructor(code: string, codeName: string, displayName: string, visualizationHints: VisualizationHint[]) {
        super();
        this.Code = code;
        this.CodeName = codeName;
        this.DisplayName = displayName;
        this._visualizationHints = visualizationHints;
    }

    public get DataType(): DataType {
        return DataType.Undefined;
    }

    @observable
    public DisplayName: string;

    public get VisualizationHints(): VisualizationHint[] {
        return this._visualizationHints;
    }

    public Equals(other: CodeAttributeModel): boolean {
        return this.CodeName === other.CodeName;
    }

}

export class BackendAttributeModel extends AttributeModel {
    private _dataType: DataType;
    private _displayName: string;
    private _codeName: string;
    private _visualizationHints: VisualizationHint[];

    public Id: string;

    constructor(id: string, dataType: DataType, displayName: string, codeName: string, visualizationHints: VisualizationHint[]) {
        super();
        this.Id = id;
        this._dataType = dataType;
        this._displayName = displayName;
        this._codeName = codeName;
        this._visualizationHints = visualizationHints;
    }

    public get DataType(): DataType {
        return this._dataType;
    }

    public get DisplayName(): string {
        return this._displayName.ReplaceAll("_", " ");;
    }

    public get CodeName(): string {
        return this._codeName;
    }

    public get VisualizationHints(): VisualizationHint[] {
        return this._visualizationHints;
    }

    public Equals(other: BackendAttributeModel): boolean {
        return this.Id == other.Id;
    }

}