import { expect } from 'chai';
import 'mocha';
import { autorun, reaction } from "mobx";
import { Doc } from '../src/new_fields/Doc';
import { Cast } from '../src/new_fields/Types';

describe("Document", () => {
    it('should hold fields', () => {
        let key = "Test";
        let key2 = "Test2";
        let field = 15;
        let doc = new Doc();
        doc[key] = field;
        let getField = Cast(doc[key], "number");
        let getField2 = Cast(doc[key2], "number");
        expect(getField).to.equal(field);
        expect(getField2).to.equal(undefined);
    });

    it('should update', () => {
        let doc = new Doc();
        let key = "Test";
        let key2 = "Test2";
        let ran = false;
        reaction(() => doc[key], (field) => { ran = true; });
        expect(ran).to.equal(false);

        doc[key2] = 4;
        expect(ran).to.equal(false);

        doc[key] = 5;

        expect(ran).to.equal(true);
    });
});
