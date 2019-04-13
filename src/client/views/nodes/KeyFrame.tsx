export class KeyFrame{
    private _document:any; 
    constructor(){
        this._document = new Document(); 
        
    }


    get document(){
        return this._document; 
    }

}