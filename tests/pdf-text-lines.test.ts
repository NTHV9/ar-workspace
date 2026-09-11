import {describe,it,expect} from 'vitest';
import {insertTextLine,removeTextLine} from '../src/pdf/text-lines';

describe('PDF text line editing',()=>{
 it('inserts at the caret or replaces a selected range without changing surrounding text',()=>{
  expect(insertTextLine('FirstSecond',5)).toEqual({text:'First\nSecond',caret:6});
  expect(insertTextLine('First selected Second',6,15)).toEqual({text:'First \nSecond',caret:7});
 });
 it('removes first, middle and last lines and preserves a sensible caret',()=>{
  expect(removeTextLine('One\nTwo\nThree',1)).toEqual({text:'Two\nThree',caret:0});
  expect(removeTextLine('One\nTwo\nThree',5)).toEqual({text:'One\nThree',caret:4});
  expect(removeTextLine('One\nTwo\nThree',10)).toEqual({text:'One\nTwo',caret:7});
 });
 it('handles empty lines, selected lines and an only line',()=>{
  expect(removeTextLine('One\n\nThree',4)).toEqual({text:'One\nThree',caret:4});
  expect(removeTextLine('One\nTwo\nThree',0,7)).toEqual({text:'Three',caret:0});
  expect(removeTextLine('One',2)).toEqual({text:'',caret:0});
  expect(removeTextLine('',0)).toEqual({text:'',caret:0});
 });
});
